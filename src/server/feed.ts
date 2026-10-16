import type { Post as RedditPost, RedditClient, SubredditInfo } from "@devvit/reddit";
import { feedQuerySchema, mixQuerySchema, subredditNameSchema, safeUrl, type Feed, type Post } from "../../lib/reddit";

export function normalizePost(post: RedditPost): Post {
  const gallery = post.gallery.filter((media) => media.status === 1)
    .map((media) => safeUrl(media.url)).filter((url): url is string => !!url);
  const direct = /\.(png|jpe?g|webp|gif)(\?.*)?$/i.test(post.url) ? safeUrl(post.url) : null;
  const thumbnail = safeUrl(post.thumbnail?.url);
  return {
    id: post.id, title: post.title, subreddit: post.subredditName, author: post.authorName,
    score: post.score, comments: post.numberOfComments, created: post.createdAt.getTime(),
    permalink: `https://www.reddit.com${post.permalink}`,
    text: (post.body ?? "").slice(0, 6000),
    images: gallery.length ? gallery : direct ? [direct] : thumbnail ? [thumbnail] : [],
    video: safeUrl(post.secureMedia?.redditVideo?.fallbackUrl), nsfw: post.nsfw, spoiler: post.spoiler,
  };
}

function readableCommunity(info: SubredditInfo): boolean {
  return ["public", "restricted"].includes(info.type ?? "") && !info.isNsfw && !info.isQuarantined;
}

export async function getFeed(reddit: Pick<RedditClient, "getHotPosts" | "getNewPosts" | "getTopPosts" | "getSubredditInfoByName">, input: unknown): Promise<Feed> {
  try {
    const query = feedQuerySchema.parse(input);
    const isAll = query.subreddit.toLowerCase() === "all";
    // All is an aggregate listing, not a community with its own access metadata.
    if (!isAll && !readableCommunity(await reddit.getSubredditInfoByName(query.subreddit))) throw new Error("Only public, non-mature communities are supported.");
    const options = { subredditName: isAll ? "all" : query.subreddit, after: query.after, pageSize: 25, limit: 25 };
    const listing = query.sort === "new" ? reddit.getNewPosts(options)
      : query.sort === "top" ? reddit.getTopPosts({ ...options, timeframe: query.time })
      : reddit.getHotPosts(options);
    const posts = await listing.get(25);
    const lastId = posts.at(-1)?.id;
    let visible = posts.filter((post) => !post.nsfw && !post.isRemoved());
    if (isAll) {
      const names = [...new Set(visible.map((post) => post.subredditName.toLowerCase()))];
      const allowed = new Set<string>();
      let checked = 0;
      // Check each source once per page, with bounded concurrent API requests.
      for (let offset = 0; offset < names.length; offset += 8) {
        const batch = names.slice(offset, offset + 8);
        const results = await Promise.allSettled(batch.map(async (name) => {
          try { return await reddit.getSubredditInfoByName(name); } catch (error) { throw error; }
        }));
        results.forEach((result, index) => {
          if (result.status === "fulfilled") {
            checked++;
            if (readableCommunity(result.value)) allowed.add(batch[index]!);
          }
        });
      }
      if (names.length && !checked) throw new Error("Couldn’t check All feed communities. Please retry.");
      visible = visible.filter((post) => allowed.has(post.subredditName.toLowerCase()));
    }
    return { posts: visible.map(normalizePost), after: listing.hasMore && lastId && lastId !== query.after ? lastId : null };
  } catch (error) { throw error; }
}

// Each page visits up to four communities, retaining an independent cursor for each.
export async function getMixedFeed(
  reddit: Pick<RedditClient, "getHotPosts" | "getNewPosts" | "getTopPosts" | "getSubredditInfoByName">,
  favourites: string[], input: unknown,
) {
  try {
    const query = mixQuerySchema.parse(input);
    const names = [...new Set(favourites.map((name) => subredditNameSchema.parse(name).toLowerCase()))].sort();
    if (names.length > 200) throw new Error("The mix supports up to 200 favourites.");
    const cursors = Object.fromEntries(Object.entries(query.after?.cursors ?? {}).filter(([name]) => names.includes(name)));
    const offset = (query.after?.offset ?? 0) % Math.max(1, names.length);
    const ordered = [...names.slice(offset), ...names.slice(0, offset)];
    const batch = ordered.filter((name) => (!Object.hasOwn(cursors, name) || cursors[name] !== null)).slice(0, 4);
    if (!batch.length) return { posts: [], after: null, warnings: [] };
    const results = await Promise.allSettled(batch.map(async (subreddit) => {
      try { return await getFeed(reddit, { subreddit, sort: query.sort, time: query.time, after: Object.hasOwn(cursors, subreddit) ? cursors[subreddit] ?? undefined : undefined }); }
      catch (error) { throw error; }
    }));
    if (results.every((result) => result.status === "rejected") && ordered.filter((name) => (!Object.hasOwn(cursors, name) || cursors[name] !== null)).length <= batch.length) throw new Error("Couldn’t load the favourite communities. Please retry.");
    const pages: Post[][] = [];
    const warnings: string[] = [];
    results.forEach((result, index) => {
      const name = batch[index]!;
      if (result.status === "fulfilled") { cursors[name] = result.value.after; pages.push(result.value.posts); }
      else warnings.push(`r/${name} couldn’t load. It will be retried on a later page.`);
    });
    const posts: Post[] = [];
    const ids = new Set<string>();
    for (let row = 0; row < 25; row++) for (const page of pages) {
      const post = page[row];
      if (post && !ids.has(post.id)) { ids.add(post.id); posts.push(post); }
    }
    const after = names.some((name) => (!Object.hasOwn(cursors, name) || cursors[name] !== null))
      ? { offset: (names.indexOf(batch.at(-1)!) + 1) % names.length, cursors } : null;
    return { posts, after, warnings };
  } catch (error) { throw error; }
}
