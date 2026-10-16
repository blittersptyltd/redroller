import { createHash } from "node:crypto";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { createServer, getServerPort, reddit, redis, context as redditContext } from "@devvit/web/server";
import type { UiResponse } from "@devvit/web/shared";
import { feedQuerySchema, favouriteUpdateSchema, favouritesSchema, readerStateSchema, mixQuerySchema, discoveryQuerySchema, discoverySchema } from "../../lib/reddit";
import { getFeed, getMixedFeed } from "./feed";
import { getDiscovery } from "./discovery";

const app = new Hono();
app.onError((error, context) => {
  console.error("Request failed", { path: context.req.path, error: error.message.slice(0, 300) });
  return context.json({ error: "Couldn’t complete the request. Please try again." }, 502);
});
app.use("/api/favourites", async (context, next) => {
  context.header("Cache-Control", "no-store");
  if (!redditContext.userId) return context.json({ error: "Sign in to Reddit to save favourites." }, 401);
  try { await next(); }
  catch (error) {
    console.error("Favourites request failed", { error: error instanceof Error ? error.message.slice(0, 300) : "Unknown error" });
    return context.json({ error: "Couldn’t save or load favourites. Please try again." }, 502);
  }
});
app.get("/api/favourites", async (context) => {
  const entries = await redis.hGetAll(`favourites:${redditContext.userId}`);
  return context.json(favouritesSchema.parse({ favourites: Object.values(entries).sort((a, b) => a.localeCompare(b)) }));
});
app.put("/api/favourites", async (context) => {
  if (!context.req.header("Content-Type")?.includes("application/json")) return context.json({ error: "Expected JSON." }, 415);
  let body: unknown;
  try { body = await context.req.json(); }
  catch { return context.json({ error: "Invalid JSON." }, 400); }
  const parsed = favouriteUpdateSchema.safeParse(body);
  if (!parsed.success) return context.json({ error: "Enter a valid subreddit name." }, 400);
  const { subreddit, saved } = parsed.data;
  const key = `favourites:${redditContext.userId}`;
  if (saved) await redis.hSet(key, { [subreddit.toLowerCase()]: subreddit });
  else await redis.hDel(key, [subreddit.toLowerCase()]);
  const entries = await redis.hGetAll(key);
  return context.json(favouritesSchema.parse({ favourites: Object.values(entries).sort((a, b) => a.localeCompare(b)) }));
});
app.use("/api/reader-state", async (context, next) => {
  context.header("Cache-Control", "no-store");
  if (!redditContext.userId) return context.json({ error: "Sign in to Reddit to remember your reading preferences." }, 401);
  try { await next(); } catch (error) { throw error; }
});
app.get("/api/reader-state", async (context) => {
  try {
    const stored = await redis.get(`reader-state:${redditContext.userId}`);
    return context.json(readerStateSchema.parse(stored ? JSON.parse(stored) : {}));
  } catch (error) { throw error; }
});
app.put("/api/reader-state", async (context) => {
  if (!context.req.header("Content-Type")?.includes("application/json")) return context.json({ error: "Expected JSON." }, 415);
  let body: unknown;
  try { body = await context.req.json(); } catch { return context.json({ error: "Invalid JSON." }, 400); }
  const parsed = readerStateSchema.safeParse(body);
  if (!parsed.success) return context.json({ error: "Invalid reader preferences." }, 400);
  try {
    await redis.set(`reader-state:${redditContext.userId}`, JSON.stringify(parsed.data));
    return context.json({ saved: true });
  } catch (error) { throw error; }
});
app.post("/api/mix", async (context) => {
  context.header("Cache-Control", "no-store");
  if (!redditContext.userId) return context.json({ error: "Sign in to Reddit to browse your favourites mix." }, 401);
  if (!context.req.header("Content-Type")?.includes("application/json")) return context.json({ error: "Expected JSON." }, 415);
  let body: unknown;
  try { body = await context.req.json(); } catch { return context.json({ error: "Invalid JSON." }, 400); }
  const parsed = mixQuerySchema.safeParse(body);
  if (!parsed.success) return context.json({ error: "Invalid mix request. Refresh the feed and retry." }, 400);
  try {
    const favourites = Object.values(await redis.hGetAll(`favourites:${redditContext.userId}`));
    return context.json(await getMixedFeed(reddit, favourites, parsed.data));
  } catch (error) { throw error; }
});
app.get("/api/discovery", async (context) => {
  context.header("Cache-Control", "no-store");
  const parsed = discoveryQuerySchema.safeParse(context.req.query());
  if (!parsed.success) return context.json({ error: "Invalid discovery request." }, 400);
  try {
    const favourites = redditContext.userId ? Object.values(await redis.hGetAll(`favourites:${redditContext.userId}`)) : [];
    const signature = createHash("sha256").update(JSON.stringify({ query: parsed.data, favourites: [...favourites].sort() })).digest("hex");
    const key = `discovery:v2:${redditContext.userId ?? "guest"}:${signature}`;
    if (parsed.data.mode !== "random") {
      const cached = await redis.get(key);
      if (cached) return context.json(discoverySchema.parse(JSON.parse(cached)));
    }
    const result = discoverySchema.parse(await getDiscovery(reddit, favourites, context.req.query()));
    if (parsed.data.mode !== "random") await redis.set(key, JSON.stringify(result), { expiration: new Date(Date.now() + 5 * 60 * 1000) });
    return context.json(result);
  } catch (error) {
    console.error("Community discovery failed", { mode: parsed.data.mode, error: error instanceof Error ? error.message.slice(0, 300) : "Unknown error" });
    return context.json({ error: "Couldn’t load community suggestions. Please try again." }, 502);
  }
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
    console.error("Subreddit feed failed", { subreddit: parsed.data.subreddit, sort: parsed.data.sort, error: error instanceof Error ? error.message.slice(0, 300) : "Unknown error" });
    return context.json({ error: "Reddit couldn’t load this community. Check the name, try a public subreddit, or retry shortly." }, 502);
  }
});
serve({ fetch: app.fetch, createServer, port: getServerPort() });
