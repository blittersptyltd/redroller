import { z } from "zod";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { createServer, getServerPort, reddit, redis, context as redditContext } from "@devvit/web/server";
import type { UiResponse } from "@devvit/web/shared";
import { feedQuerySchema, favouriteUpdateSchema, readerStateSchema, mixQuerySchema, discoveryQuerySchema, discoverySchema } from "../../lib/reddit";
import { getFeed, getMixedFeed } from "./feed";
import { getDiscovery } from "./discovery";
import { UserDataStore, ConsentRequiredError } from "./user-data";

const app = new Hono();
const userData = new UserDataStore(redis);
app.onError((error, context) => {
  if (error instanceof ConsentRequiredError) return context.json({ error: error.message }, 409);
  console.error("Request failed", { path: context.req.path, error: error.name });
  return context.json({ error: "Couldn’t complete the request. Please try again." }, 502);
});
app.use("/api/*", async (context, next) => {
  context.header("Cache-Control", "no-store");
  try { await next(); } catch (error) { throw error; }
});
app.get("/api/privacy", async (context) => {
  try {
    const userId = redditContext.userId;
    if (!userId) return context.json({ signedIn: false, token: null });
    await userData.expireLegacy(userId);
    const stored = await userData.read(userId);
    return context.json({ signedIn: true, token: stored?.token ?? null });
  } catch (error) { throw error; }
});
app.post("/api/privacy", async (context) => {
  const userId = redditContext.userId;
  if (!userId) return context.json({ error: "Sign in to Reddit to save data." }, 401);
  if (!context.req.header("Content-Type")?.includes("application/json")) return context.json({ error: "Expected JSON." }, 415);
  let input: unknown;
  try { input = await context.req.json(); } catch { return context.json({ error: "Invalid JSON." }, 400); }
  if (!z.object({ remember: z.literal(true) }).strict().safeParse(input).success) return context.json({ error: "Choose whether to remember your data." }, 400);
  try {
    const stored = await userData.change(userId, context.req.header("X-Reader-Consent") ?? null, (current) => current, true);
    return context.json({ signedIn: true, token: stored!.token });
  } catch (error) { throw error; }
});
app.delete("/api/privacy", async (context) => {
  const userId = redditContext.userId;
  if (!userId) return context.json({ error: "Sign in to Reddit to delete saved data." }, 401);
  try {
    await userData.change(userId, context.req.header("X-Reader-Consent") ?? null, () => null, true);
    if (await userData.read(userId)) throw new Error("Couldn’t confirm deletion. Please retry.");
    return context.json({ deleted: true });
  } catch (error) { throw error; }
});
app.get("/api/favourites", async (context) => {
  try {
    const stored = redditContext.userId ? await userData.read(redditContext.userId) : null;
    return context.json({ favourites: stored?.favourites ?? [] });
  } catch (error) { throw error; }
});
app.put("/api/favourites", async (context) => {
  const userId = redditContext.userId;
  if (!userId) return context.json({ error: "Sign in to Reddit to save favourites." }, 401);
  if (!context.req.header("Content-Type")?.includes("application/json")) return context.json({ error: "Expected JSON." }, 415);
  let input: unknown;
  try { input = await context.req.json(); } catch { return context.json({ error: "Invalid JSON." }, 400); }
  const parsed = favouriteUpdateSchema.safeParse(input);
  if (!parsed.success) return context.json({ error: "Enter a valid subreddit name." }, 400);
  try {
    const stored = await userData.change(userId, context.req.header("X-Reader-Consent") ?? null, (current) => {
      const favourites = current.favourites.filter((name) => name.toLowerCase() !== parsed.data.subreddit.toLowerCase());
      if (parsed.data.saved) favourites.push(parsed.data.subreddit);
      if (favourites.length > 200) throw new Error("You can save up to 200 favourites.");
      return { ...current, favourites: favourites.sort((a, b) => a.localeCompare(b)) };
    });
    return context.json({ favourites: stored!.favourites });
  } catch (error) { throw error; }
});
app.get("/api/reader-state", async (context) => {
  try {
    const stored = redditContext.userId ? await userData.read(redditContext.userId) : null;
    return context.json(stored?.state ?? readerStateSchema.parse({}));
  } catch (error) { throw error; }
});
app.put("/api/reader-state", async (context) => {
  const userId = redditContext.userId;
  if (!userId) return context.json({ error: "Sign in to Reddit to remember your preferences." }, 401);
  if (!context.req.header("Content-Type")?.includes("application/json")) return context.json({ error: "Expected JSON." }, 415);
  let input: unknown;
  try { input = await context.req.json(); } catch { return context.json({ error: "Invalid JSON." }, 400); }
  const parsed = readerStateSchema.safeParse(input);
  if (!parsed.success) return context.json({ error: "Invalid reader preferences." }, 400);
  try {
    await userData.change(userId, context.req.header("X-Reader-Consent") ?? null, (current) => ({ ...current, state: parsed.data }));
    return context.json({ saved: true });
  } catch (error) { throw error; }
});
app.post("/api/mix", async (context) => {
  if (!context.req.header("Content-Type")?.includes("application/json")) return context.json({ error: "Expected JSON." }, 415);
  let input: unknown;
  try { input = await context.req.json(); } catch { return context.json({ error: "Invalid JSON." }, 400); }
  const parsed = mixQuerySchema.safeParse(input);
  if (!parsed.success) return context.json({ error: "Invalid mix request." }, 400);
  try {
    const stored = redditContext.userId ? await userData.read(redditContext.userId) : null;
    return context.json(await getMixedFeed(reddit, stored?.favourites ?? [], parsed.data));
  } catch (error) { throw error; }
});
app.get("/api/discovery", async (context) => {
  const parsed = discoveryQuerySchema.safeParse(context.req.query());
  if (!parsed.success) return context.json({ error: "Invalid discovery request." }, 400);
  try {
    const stored = redditContext.userId ? await userData.read(redditContext.userId) : null;
    // Do not persist another copy of a user's favourite-derived recommendations.
    return context.json(discoverySchema.parse(await getDiscovery(reddit, stored?.favourites ?? [], context.req.query())));
  } catch (error) { throw error; }
});
app.post("/internal/on-app-upgrade", async (context) => {
  try {
    const input = z.object({ installer: z.object({ id: z.string().regex(/^t2_[a-z0-9]+$/) }).optional() }).parse(await context.req.json());
    if (input.installer) await userData.expireLegacy(input.installer.id);
    return context.json({ status: "ok" });
  } catch (error) { throw error; }
});
app.post("/internal/menu/create-reader", async (context) => {
  try {
    const post = await reddit.submitCustomPost({ title: "Redroller — explore your favourite subreddits", entry: "default" });
    return context.json<UiResponse>({ navigateTo: post.url });
  } catch (error) {
    console.error("Reader post creation failed", { error: error instanceof Error ? error.message.slice(0, 300) : "Unknown error" });
    return context.json<UiResponse>({ showToast: "Could not create the reader. Please try again." });
  }
});
app.get("/api/feed", async (context) => {
  const parsed = feedQuerySchema.safeParse(context.req.query());
  if (!parsed.success) return context.json({ error: "Use a subreddit name with 2–21 letters, numbers, or underscores." }, 400);
  try { return context.json(await getFeed(reddit, parsed.data)); }
  catch (error) {
    console.error("Subreddit feed failed", { error: error instanceof Error ? error.name : "Unknown error" });
    return context.json({ error: "This community couldn’t load. Redroller supports public, non-mature communities. Check the name or retry shortly." }, 502);
  }
});
serve({ fetch: app.fetch, createServer, port: getServerPort() });
