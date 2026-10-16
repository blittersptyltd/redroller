import { z } from "zod";

export const subredditNameSchema = z.string().trim().regex(/^[A-Za-z0-9_]{2,21}$/);
export const favouritesSchema = z.object({ favourites: z.array(subredditNameSchema) });
export const favouriteUpdateSchema = z.object({ subreddit: subredditNameSchema, saved: z.boolean() });

export const feedQuerySchema = z.object({
  subreddit: subredditNameSchema.default("pics"),
  sort: z.enum(["hot", "new", "top"]).default("hot"),
  time: z.enum(["hour", "day", "week", "month", "year", "all"]).default("week"),
  after: z.string().trim().regex(/^t3_[a-z0-9]+$/).optional(),
});
export type FeedQuery = z.infer<typeof feedQuerySchema>;
export const postSchema = z.object({
  id: z.string(), title: z.string(), subreddit: z.string(), author: z.string(),
  score: z.number(), comments: z.number(), created: z.number(), permalink: z.string(),
  text: z.string(), images: z.array(z.string()), video: z.string().nullable(),
  nsfw: z.boolean(), spoiler: z.boolean(),
});
export const feedSchema = z.object({ posts: z.array(postSchema), after: z.string().nullable() });
export type Post = z.infer<typeof postSchema>;
export type Feed = z.infer<typeof feedSchema>;

export function safeUrl(input: string | undefined): string | null {
  if (!input) return null;
  try {
    const url = new URL(input.replaceAll("&amp;", "&"));
    return url.protocol === "https:" ? url.toString() : null;
  } catch { return null; }
}

const postIdSchema = z.string().max(20).regex(/^t3_[a-z0-9]+$/);
export const mixCursorSchema = z.object({
  offset: z.number().int().min(0).max(1000000),
  cursors: z.record(subredditNameSchema, postIdSchema.nullable()).refine((value) => Object.keys(value).length <= 200),
});
export const mixQuerySchema = feedQuerySchema.pick({ sort: true, time: true }).extend({ after: mixCursorSchema.optional() });
export const mixFeedSchema = z.object({ posts: z.array(postSchema), after: mixCursorSchema.nullable(), warnings: z.array(z.string()) });
export type MixCursor = z.infer<typeof mixCursorSchema>;
export type PageCursor = string | MixCursor | null;
export const resumeSchema = z.object({
  after: z.union([postIdSchema, mixCursorSchema]).nullable(),
  anchor: postIdSchema,
  offset: z.number().min(-10000).max(10000),
});
export const readerStateSchema = z.object({
  query: feedQuerySchema.omit({ after: true }).default({ subreddit: "pics", sort: "hot", time: "week" }),
  source: z.enum(["community", "favourites"]).default("community"),
  compact: z.boolean().default(false),
  mediaOnly: z.boolean().default(false),
  hideSeen: z.boolean().default(false),
  seen: z.array(postIdSchema).max(2000).default([]),
  resume: resumeSchema.nullable().default(null),
});
export type ReaderState = z.infer<typeof readerStateSchema>;
export type Resume = z.infer<typeof resumeSchema>;
export const privacyStatusSchema = z.object({ signedIn: z.boolean(), token: z.uuid().nullable() });

export const discoveryQuerySchema = z.object({
  mode: z.enum(["recommended", "popular", "random"]).default("recommended"),
  period: z.enum(["all", "trending"]).default("trending"),
  exclude: z.string().max(1500).default("").transform((value) => value.split(",").map((name) => name.trim()).filter(Boolean)).pipe(z.array(subredditNameSchema).max(60)),
  rotation: z.coerce.number().int().min(0).max(100000).default(0),
});
export const discoverySchema = z.object({
  items: z.array(z.object({ name: subredditNameSchema, title: z.string(), reason: z.string(), members: z.number().nonnegative().nullable() })),
  note: z.string(),
});
export type Discovery = z.infer<typeof discoverySchema>;
export type DiscoveryQuery = z.infer<typeof discoveryQuerySchema>;
