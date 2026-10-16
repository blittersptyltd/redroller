import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { RedisClient } from "@devvit/redis";
import { readerStateSchema, subredditNameSchema } from "../../lib/reddit";

export const USER_DATA_TTL_SECONDS = 30 * 24 * 60 * 60;
export const savedDataSchema = z.object({
  token: z.uuid(),
  favourites: z.array(subredditNameSchema).max(200),
  state: readerStateSchema,
});
export type SavedData = z.infer<typeof savedDataSchema>;
export class ConsentRequiredError extends Error {}

export class UserDataStore {
  constructor(private readonly redis: Pick<RedisClient, "get" | "hGetAll" | "watch" | "expire">) {}
  async read(userId: string): Promise<SavedData | null> {
    try {
      const raw = await this.redis.get(`user-data:v1:${userId}`);
      return raw ? savedDataSchema.parse(JSON.parse(raw)) : null;
    } catch (error) { throw error; }
  }
  async expireLegacy(userId: string) {
    try {
      await this.redis.expire(`favourites:${userId}`, USER_DATA_TTL_SECONDS);
      await this.redis.expire(`reader-state:${userId}`, USER_DATA_TTL_SECONDS);
    } catch (error) { throw error; }
  }
  // WATCH prevents an old tab or an in-flight save from restoring data after deletion.
  async change(userId: string, token: string | null, update: (current: SavedData) => SavedData | null, create = false) {
    const key = `user-data:v1:${userId}`;
    const transaction = await this.redis.watch(key);
    let finished = false;
    try {
      let current = await this.read(userId);
      if (create && !current) {
        const legacy = await this.redis.get(`reader-state:${userId}`);
        current = savedDataSchema.parse({ token: randomUUID(), favourites: Object.values(await this.redis.hGetAll(`favourites:${userId}`)), state: legacy ? JSON.parse(legacy) : {} });
      } else if (!current || current.token !== token) {
        throw new ConsentRequiredError("Saving is off or changed in another tab. Reopen Privacy & help to choose again.");
      }
      const updated = update(current);
      await transaction.multi();
      if (updated) await transaction.set(key, JSON.stringify(savedDataSchema.parse(updated)), { expiration: new Date(Date.now() + USER_DATA_TTL_SECONDS * 1000) });
      else await transaction.del(key);
      await transaction.del(`favourites:${userId}`, `reader-state:${userId}`);
      const result = await transaction.exec();
      finished = true;
      if (!result?.length) throw new Error("Saved data changed in another tab. Please retry.");
      return updated;
    } catch (error) { throw error; }
    finally {
      if (!finished) {
        try { await transaction.discard(); } catch { /* The server may already have aborted the transaction. */ }
      }
    }
  }
}
