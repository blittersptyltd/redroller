import type { RedditClient, SubredditInfo } from "@devvit/reddit";
import { discoveryQuerySchema, subredditNameSchema, type Discovery } from "../../lib/reddit";

type DiscoveryClient = Pick<RedditClient, "getHotPosts" | "getTopPosts" | "getNewPosts" | "searchPosts" | "getSubredditInfoByName">;
type Candidate = { name: string; reason: string; score: number };
const META_COMMUNITIES = new Set(["all", "popular", "random", "modhelp", "modsupport", "redditrequest", "announcements", "reddit", "help"]);

export function linkedCommunities(markdown: string): string[] {
  const matches = markdown.matchAll(/(?:^|[\s(/])r\/([a-z0-9_]{2,21})(?=$|[\s/)\]#?.,])/gi);
  return [...new Set([...matches].map((match) => match[1]!.toLowerCase()))].filter((name) => !META_COMMUNITIES.has(name));
}
export function discoverable(info: SubredditInfo): boolean {
  return !!info.name && info.type !== "private" && !info.isNsfw && !info.isQuarantined && info.isDiscoveryAllowed !== false;
}
export function shuffleCandidates<T>(values: T[], random = Math.random): T[] {
  const shuffled = [...values];
  for (let index = shuffled.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[other]] = [shuffled[other]!, shuffled[index]!];
  }
  return shuffled;
}

export async function getDiscovery(reddit: DiscoveryClient, favourites: string[], input: unknown): Promise<Discovery> {
  try {
    const query = discoveryQuerySchema.parse(input);
    const saved = [...new Set(favourites.map((name) => subredditNameSchema.parse(name).toLowerCase()))].sort();
    const excluded = new Set([...query.exclude.map((name) => name.toLowerCase()), ...saved]);
    const candidates = new Map<string, Candidate>();
    let partial = false;
    const add = (name: string, score: number, reason: string) => {
      const parsed = subredditNameSchema.safeParse(name);
      if (!parsed.success) return;
      const key = parsed.data.toLowerCase();
      if (excluded.has(key) || META_COMMUNITIES.has(key)) return;
      const existing = candidates.get(key);
      candidates.set(key, { name: parsed.data, score: (existing?.score ?? 0) + score, reason: existing?.reason ?? reason });
    };
    let note: string;
    if (query.mode === "recommended") {
      if (!saved.length) return { items: [], note: "Star a few communities to get recommendations based on your favourites." };
      // Rotate through saved communities so large favourite lists also get coverage.
      const offset = (query.rotation * 4) % saved.length;
      const seeds = [...saved.slice(offset), ...saved.slice(0, offset)].slice(0, 4);
      const metadata = await Promise.allSettled(seeds.map(async (name) => {
        try { return await reddit.getSubredditInfoByName(name); } catch (error) { throw error; }
      }));
      if (metadata.every((result) => result.status === "rejected")) throw new Error("Couldn’t read your favourite communities. Please retry.");
      metadata.forEach((result, index) => {
        if (result.status === "rejected") { partial = true; return; }
        linkedCommunities(result.value.description?.markdown ?? "").forEach((name, rank) => add(name, 100 / (rank + 1), `Linked from r/${seeds[index]}`));
      });
      // When sidebars provide few links, find public discussions that explicitly mention a favourite.
      if (candidates.size < 12) {
        const searches = await Promise.allSettled(seeds.slice(0, 2).map(async (name) => {
          try { return await reddit.searchPosts({ query: `"${name}"`, sort: "relevance", timeframe: "all", limit: 40, pageSize: 40 }).get(40); }
          catch (error) { throw error; }
        }));
        searches.forEach((result, index) => {
          if (result.status === "rejected") { partial = true; return; }
          for (const post of result.value) {
            if (post.nsfw) continue;
            // Search relevance alone is not a relationship: require an explicit community mention.
            const mentions = linkedCommunities(`${post.title} ${post.body ?? ""}`);
            if (mentions.includes(seeds[index]!)) add(post.subredditName, 10, `Discusses r/${seeds[index]}`);
          }
        });
      }
      note = candidates.size ? "Connections from your favourites’ community links and discussions." : "No related communities found yet. Try more favourites, Popular or Random.";
    } else {
      const options = { subredditName: query.mode === "random" ? "all" : "popular", limit: 100, pageSize: 100 };
      const posts = await (query.mode === "random" ? reddit.getNewPosts(options)
        : query.period === "all" ? reddit.getTopPosts({ ...options, timeframe: "all" }) : reddit.getHotPosts(options)).get(100);
      posts.forEach((post, index) => {
        if (!post.nsfw) add(post.subredditName, query.period === "all" ? Math.max(1, post.score) : 100 - index,
          query.mode === "random" ? "Found in Reddit’s recent posts" : query.period === "all" ? "Featured in all-time top posts" : "Appearing in Popular right now");
      });
      note = query.mode === "random" ? "A shuffled selection from communities posting across Reddit. Shuffle for another batch."
        : query.period === "all" ? "Communities ranked by combined scores in Reddit’s top 100 all-time Popular posts."
        : "Communities ranked by appearances and position in Reddit’s current Popular posts.";
    }
    let ranked = [...candidates.values()].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
    if (query.mode === "random") ranked = shuffleCandidates(ranked);
    const items: Discovery["items"] = [];
    let resolved = 0;
    // Bound work and check current community availability before suggesting it.
    for (let offset = 0; offset < Math.min(ranked.length, 32) && items.length < 8; offset += 8) {
      const batch = ranked.slice(offset, offset + 8);
      const details = await Promise.allSettled(batch.map(async (candidate) => {
        try { return await reddit.getSubredditInfoByName(candidate.name); } catch (error) { throw error; }
      }));
      details.forEach((result, index) => {
        if (result.status === "rejected") { partial = true; return; }
        resolved++;
        const info = result.value;
        if (!discoverable(info) || excluded.has(info.name!.toLowerCase())) return;
        items.push({ name: info.name!, title: info.title ?? info.name!, reason: batch[index]!.reason, members: info.subscribersCount ?? null });
      });
    }
    if (ranked.length && !resolved) throw new Error("Couldn’t check the suggested communities. Please retry.");
    if (partial) note += " Some communities couldn’t be checked.";
    if (!items.length && candidates.size) note = "No available public communities in this batch. Try another mode or shuffle again.";
    return { items: items.slice(0, 8), note };
  } catch (error) { throw error; }
}
