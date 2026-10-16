import assert from "node:assert/strict";
import { test } from "node:test";
import type { Post, RedditClient } from "@devvit/reddit";
import { getFeed, normalizePost } from "./feed";
import { feedQuerySchema, safeUrl } from "../../lib/reddit";

function post(id = "t3_abc"): Post {
  return { id, title: "A test post", subredditName: "pics", authorName: "tester", score: 4,
    numberOfComments: 2, createdAt: new Date("2026-10-15T00:00:00Z"),
    permalink: "/r/pics/comments/abc/example/", body: "Some text", url: "https://i.redd.it/example.jpg",
    gallery: [], thumbnail: undefined, secureMedia: undefined, nsfw: false, spoiler: false, isRemoved: () => false } as unknown as Post;
}

test("input rejects paths and invalid cursors while trimming subreddit names", () => {
  assert.equal(feedQuerySchema.parse({ subreddit: " pics " }).subreddit, "pics");
  assert.equal(feedQuerySchema.safeParse({ subreddit: "../private" }).success, false);
  assert.equal(feedQuerySchema.safeParse({ after: "https://example.com" }).success, false);
  assert.equal(safeUrl("javascript:alert(1)"), null);
  assert.equal(safeUrl("https://i.redd.it/a.jpg?a=1&amp;b=2"), "https://i.redd.it/a.jpg?a=1&b=2");
});

test("media normalization keeps galleries and content warnings", () => {
  const data = { ...post(), gallery: [{ status: 1, url: "https://i.redd.it/one.jpg", width: 300, height: 200 }, { status: 2, url: "https://i.redd.it/broken.jpg", width: 1, height: 1 }], nsfw: true, spoiler: true } as Post;
  const normalized = normalizePost(data);
  assert.deepEqual(normalized.images, ["https://i.redd.it/one.jpg"]);
  assert.equal(normalized.nsfw, true);
  assert.equal(normalized.spoiler, true);
  assert.equal(normalized.permalink, "https://www.reddit.com/r/pics/comments/abc/example/");
});

test("pagination uses the last returned post and preserves subreddit and top timeframe", async () => {
  try {
    let captured: unknown;
    const client = { async getSubredditInfoByName() { return { type: "public", isNsfw: false, isQuarantined: false }; }, getTopPosts(options: unknown) { captured = options; return { hasMore: true, async get(count: number) { assert.equal(count, 25); return [post("t3_abc"), post("t3_def")]; } }; } } as unknown as RedditClient;
    const result = await getFeed(client, { subreddit: "space", sort: "top", time: "month", after: "t3_prev" });
    assert.deepEqual(captured, { subredditName: "space", timeframe: "month", after: "t3_prev", pageSize: 25, limit: 25 });
    assert.equal(result.after, "t3_def");
    assert.equal(result.posts.length, 2);
  } catch (error) { throw error; }
});

test("pagination ends on exhausted or repeated cursors", async () => {
  try {
    const client = { async getSubredditInfoByName() { return { type: "public", isNsfw: false, isQuarantined: false }; }, getHotPosts() { return { hasMore: true, async get() { return [post()]; } }; } } as unknown as RedditClient;
    assert.equal((await getFeed(client, { subreddit: "pics", after: "t3_abc" })).after, null);
    const emptyClient = { async getSubredditInfoByName() { return { type: "public", isNsfw: false, isQuarantined: false }; }, getHotPosts() { return { hasMore: false, async get() { return []; } }; } } as unknown as RedditClient;
    assert.deepEqual(await getFeed(emptyClient, {}), { posts: [], after: null });
  } catch (error) { throw error; }
});

test("upstream failure propagates without inventing content", async () => {
  try {
    const client = { async getSubredditInfoByName() { return { type: "public", isNsfw: false, isQuarantined: false }; }, getNewPosts() { return { async get() { throw new Error("Access denied"); } }; } } as unknown as RedditClient;
    await assert.rejects(getFeed(client, { sort: "new" }), /Access denied/);
  } catch (error) { throw error; }
});

test("community restrictions are checked before any posts are requested", async () => {
  try {
    for (const info of [{ type: "private" }, { type: "public", isNsfw: true }, { type: "public", isQuarantined: true }, {}]) {
      let requested = false;
      const client = { async getSubredditInfoByName() { return info; }, getHotPosts() { requested = true; throw new Error("Unexpected post request"); } } as unknown as RedditClient;
      await assert.rejects(getFeed(client, { subreddit: "example" }), /Only public/);
      assert.equal(requested, false);
    }
  } catch (error) { throw error; }
});

test("mature and removed posts are excluded without losing pagination progress", async () => {
  try {
    const client = {
      async getSubredditInfoByName() { return { type: "public" }; },
      getHotPosts() { return { hasMore: true, async get() { return [post(), { ...post("t3_adult"), nsfw: true }, { ...post("t3_removed"), isRemoved: () => true }]; } }; },
    } as unknown as RedditClient;
    const result = await getFeed(client, {});
    assert.deepEqual(result.posts.map((item) => item.id), ["t3_abc"]);
    assert.equal(result.after, "t3_removed");
  } catch (error) { throw error; }
});

test("All fetches an aggregate listing and checks each source community once before displaying it", async () => {
  try {
    const names: string[] = [];
    let options: unknown;
    const sourcePosts = ["pics", "PICS", "privateplace", "adultplace", "quarantine", "unavailable", "restrictedplace"].map((name, index) => ({ ...post(`t3_${index}`), subredditName: name }));
    const client = {
      async getSubredditInfoByName(name: string) {
        names.push(name);
        if (name === "unavailable") throw new Error("Offline");
        return { type: name === "privateplace" ? "private" : name === "restrictedplace" ? "restricted" : "public", isNsfw: name === "adultplace", isQuarantined: name === "quarantine" };
      },
      getTopPosts(input: unknown) { options = input; return { hasMore: true, async get() { return sourcePosts; } }; },
    } as unknown as RedditClient;
    const result = await getFeed(client, { subreddit: "ALL", sort: "top", time: "month", after: "t3_before" });
    assert.deepEqual(options, { subredditName: "all", timeframe: "month", after: "t3_before", pageSize: 25, limit: 25 });
    assert.deepEqual(names, ["pics", "privateplace", "adultplace", "quarantine", "unavailable", "restrictedplace"]);
    assert.deepEqual(result.posts.map((item) => item.id), ["t3_0", "t3_1", "t3_6"]);
    assert.equal(result.after, "t3_6");
  } catch (error) { throw error; }
});

test("All retains its raw cursor on a fully filtered page and reports a complete metadata outage", async () => {
  try {
    const client = {
      async getSubredditInfoByName() { return { type: "private" }; },
      getHotPosts() { return { hasMore: true, async get() { return [post("t3_blocked")]; } }; },
    } as unknown as RedditClient;
    assert.deepEqual(await getFeed(client, { subreddit: "all" }), { posts: [], after: "t3_blocked" });
    const unavailable = { getHotPosts: client.getHotPosts, async getSubredditInfoByName() { throw new Error("Offline"); } } as unknown as RedditClient;
    await assert.rejects(getFeed(unavailable, { subreddit: "all" }), /Couldn’t check All/);
  } catch (error) { throw error; }
});

test("new readers default to All while previously saved community and mix selections survive", async () => {
  try {
    const { readerStateSchema } = await import("../../lib/reddit");
    assert.equal(feedQuerySchema.parse({}).subreddit, "all");
    assert.equal(readerStateSchema.parse({}).query.subreddit, "all");
    const saved = { query: { subreddit: "space", sort: "new", time: "week" }, resume: { after: "t3_abc", anchor: "t3_def", offset: -80 } };
    assert.equal(readerStateSchema.parse(saved).query.subreddit, "space");
    assert.deepEqual(readerStateSchema.parse(saved).resume, saved.resume);
    assert.equal(readerStateSchema.parse({ source: "favourites" }).source, "favourites");
  } catch (error) { throw error; }
});

test("mixed pages round-robin communities and retain independent cursors", async () => {
  try {
    const { getMixedFeed } = await import("./feed");
    const calls: Array<{ subredditName: string; after?: string }> = [];
    const client = { async getSubredditInfoByName() { return { type: "public", isNsfw: false, isQuarantined: false }; }, getHotPosts(options: { subredditName: string; after?: string }) {
      calls.push(options);
      return { hasMore: !options.after, async get() { return [post(`t3_${options.subredditName}${options.after ? '2' : '1'}`)]; } };
    } } as unknown as RedditClient;
    const first = await getMixedFeed(client, ["pics", "space"], {});
    assert.deepEqual(first.posts.map((post) => post.id), ["t3_pics1", "t3_space1"]);
    assert.deepEqual(first.after?.cursors, { pics: "t3_pics1", space: "t3_space1" });
    const second = await getMixedFeed(client, ["pics", "space"], { after: first.after });
    assert.equal(second.after, null);
    assert.equal(calls[2]?.after, "t3_pics1");
    assert.equal(calls[3]?.after, "t3_space1");
  } catch (error) { throw error; }
});

test("mixed pagination visits all favourites with at most four requests per page", async () => {
  try {
    const { getMixedFeed } = await import("./feed");
    const names: string[] = [];
    const client = { async getSubredditInfoByName() { return { type: "public", isNsfw: false, isQuarantined: false }; }, getHotPosts(options: { subredditName: string }) {
      names.push(options.subredditName);
      return { hasMore: false, async get() { return [post(`t3_${options.subredditName}`)]; } };
    } } as unknown as RedditClient;
    const first = await getMixedFeed(client, ["aa", "bb", "cc", "dd", "ee"], {});
    assert.equal(names.length, 4);
    assert.ok(first.after);
    const second = await getMixedFeed(client, ["aa", "bb", "cc", "dd", "ee"], { after: first.after });
    assert.deepEqual(names, ["aa", "bb", "cc", "dd", "ee"]);
    assert.equal(second.after, null);
    assert.deepEqual(await getMixedFeed(client, [], {}), { posts: [], after: null, warnings: [] });
  } catch (error) { throw error; }
});

test("mix preserves retryable failures, deduplicates posts and ignores removed favourites", async () => {
  try {
    const { getMixedFeed } = await import("./feed");
    const client = { async getSubredditInfoByName() { return { type: "public", isNsfw: false, isQuarantined: false }; }, getHotPosts(options: { subredditName: string }) {
      return { hasMore: false, async get() { if (options.subredditName === "blocked") throw new Error("Denied"); return [post()]; } };
    } } as unknown as RedditClient;
    const first = await getMixedFeed(client, ["pics", "space", "blocked"], {});
    assert.equal(first.posts.length, 1);
    assert.equal(first.warnings.length, 1);
    assert.equal(first.after?.cursors.blocked, undefined);
    const second = await getMixedFeed(client, ["pics", "space"], { after: first.after });
    assert.equal(second.after, null);
    await assert.rejects(getMixedFeed(client, ["blocked"], {}), /Couldn’t load/);
  } catch (error) { throw error; }
});

test("reader state validates bounded history and resume cursors", async () => {
  try {
    const { readerStateSchema, mixQuerySchema } = await import("../../lib/reddit");
    const defaults = readerStateSchema.parse({});
    assert.equal(defaults.hideSeen, false);
    assert.equal(defaults.resume, null);
    assert.equal(readerStateSchema.safeParse({ seen: Array(2001).fill("t3_abc") }).success, false);
    assert.equal(readerStateSchema.safeParse({ resume: { after: "https://evil.test", anchor: "t3_abc", offset: 0 } }).success, false);
    assert.equal(mixQuerySchema.safeParse({ after: { offset: -1, cursors: {} } }).success, false);
    assert.equal(mixQuerySchema.safeParse({ after: { offset: 0, cursors: { "../bad": "t3_abc" } } }).success, false);
    const resumed = readerStateSchema.parse({ compact: true, source: "favourites", resume: { after: { offset: 1, cursors: { pics: "t3_abc" } }, anchor: "t3_def", offset: -120 }, seen: ["t3_abc"] });
    assert.equal(resumed.resume?.anchor, "t3_def");
  } catch (error) { throw error; }
});

test("discovery extracts real community references and ignores meta communities", async () => {
  try {
    const { linkedCommunities } = await import("./discovery");
    assert.deepEqual(linkedCommunities("[Photos](https://www.reddit.com/r/Photography/) and /r/pics, r/PICS [bad](https://example.com) r/all"), ["photography", "pics"]);
  } catch (error) { throw error; }
});

test("recommendations use favourite links, omit saved/private/adult communities and explain why", async () => {
  try {
    const { getDiscovery } = await import("./discovery");
    const client = {
      async getSubredditInfoByName(name: string) { return { name, type: name === "privateplace" ? "private" : "public", isNsfw: name === "adultplace", subscribersCount: 100, description: { markdown: name === "pics" ? "r/photography r/space r/privateplace r/adultplace r/pics" : "" } }; },
      searchPosts() { return { async get() { return []; } }; },
    } as unknown as RedditClient;
    const result = await getDiscovery(client, ["pics", "space"], { mode: "recommended" });
    assert.deepEqual(result.items.map((item) => item.name), ["photography"]);
    assert.equal(result.items[0]?.reason, "Linked from r/pics");
    assert.equal((await getDiscovery(client, [], {})).items.length, 0);
    assert.match((await getDiscovery(client, [], {})).note, /Star a few/);
  } catch (error) { throw error; }
});

test("popular modes use live all-time or hot listings and aggregate communities", async () => {
  try {
    const { getDiscovery } = await import("./discovery");
    let options: unknown;
    const client = {
      getTopPosts(input: unknown) { options = input; return { async get() { return [{ ...post(), subredditName: "space", score: 100 }, { ...post(), subredditName: "pics", score: 40 }, { ...post(), subredditName: "pics", score: 80 }]; } }; },
      getHotPosts(input: unknown) { options = input; return { async get() { return [{ ...post(), subredditName: "aww", score: 4 }]; } }; },
      async getSubredditInfoByName(name: string) { return { name, type: "public" }; },
    } as unknown as RedditClient;
    assert.deepEqual((await getDiscovery(client, [], { mode: "popular", period: "all" })).items.map((item) => item.name), ["pics", "space"]);
    assert.deepEqual(options, { subredditName: "popular", limit: 100, pageSize: 100, timeframe: "all" });
    assert.equal((await getDiscovery(client, [], { mode: "popular", period: "trending" })).items[0]?.name, "aww");
    assert.deepEqual(options, { subredditName: "popular", limit: 100, pageSize: 100 });
  } catch (error) { throw error; }
});

test("random discovery excludes recent suggestions and rejects upstream failure instead of inventing results", async () => {
  try {
    const { getDiscovery, shuffleCandidates } = await import("./discovery");
    assert.deepEqual(shuffleCandidates([1, 2, 3], () => 0), [2, 3, 1]);
    const client = {
      getNewPosts() { return { async get() { return ["pics", "space", "aww"].map((name) => ({ ...post(), subredditName: name })); } }; },
      async getSubredditInfoByName(name: string) { return { name, type: "public" }; },
    } as unknown as RedditClient;
    assert.deepEqual((await getDiscovery(client, ["pics"], { mode: "random", exclude: "space" })).items.map((item) => item.name), ["aww"]);
    await assert.rejects(getDiscovery({ async getSubredditInfoByName() { return { type: "public", isNsfw: false, isQuarantined: false }; }, getHotPosts() { throw new Error("offline"); } } as unknown as RedditClient, [], { mode: "popular" }), /offline/);
  } catch (error) { throw error; }
});
