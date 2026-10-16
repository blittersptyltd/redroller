import assert from "node:assert/strict";
import { test } from "node:test";
import type { RedisClient } from "@devvit/redis";
import { readerStateSchema } from "../../lib/reddit";
import { ConsentRequiredError, UserDataStore, USER_DATA_TTL_SECONDS } from "./user-data";

// A versioned Redis double models WATCH aborts without touching anyone's saved data.
function fixture() {
  const values = new Map<string, string>();
  const hashes = new Map<string, Record<string, string>>();
  const versions = new Map<string, number>();
  const expirations = new Map<string, number>();
  const bump = (key: string) => versions.set(key, (versions.get(key) ?? 0) + 1);
  let beforeExec: (() => Promise<void>) | undefined;
  const redis = {
    async get(key: string) { return values.get(key); },
    async hGetAll(key: string) { return hashes.get(key) ?? {}; },
    async expire(key: string, seconds: number) { expirations.set(key, Date.now() + seconds * 1000); },
    async watch(key: string) {
      const version = versions.get(key) ?? 0;
      const queued: Array<{ key: string; value?: string; expiration?: number }> = [];
      return {
        async multi() {},
        async set(name: string, value: string, options: { expiration: Date }) { queued.push({ key: name, value, expiration: options.expiration.getTime() }); },
        async del(...keys: string[]) { queued.push(...keys.map((name) => ({ key: name }))); },
        async discard() { queued.length = 0; },
        async exec() {
          try {
            const interleave = beforeExec;
            beforeExec = undefined;
            await interleave?.();
            if ((versions.get(key) ?? 0) !== version) return [];
            for (const item of queued) {
              if (item.value === undefined) { values.delete(item.key); hashes.delete(item.key); expirations.delete(item.key); }
              else { values.set(item.key, item.value); expirations.set(item.key, item.expiration!); }
              bump(item.key);
            }
            return queued.map(() => "OK");
          } catch (error) { throw error; }
        },
      };
    },
  };
  return { values, hashes, expirations, store: new UserDataStore(redis as unknown as RedisClient), interleave(action: () => Promise<void>) { beforeExec = action; } };
}

test("saving requires consent and opting in preserves legacy favourites and reader state", async () => {
  try {
    const { store, values, hashes, expirations } = fixture();
    hashes.set("favourites:t2_test", { pics: "pics", space: "space" });
    values.set("reader-state:t2_test", JSON.stringify(readerStateSchema.parse({ compact: true, seen: ["t3_abc"] })));
    await assert.rejects(store.change("t2_test", null, (data) => data), ConsentRequiredError);
    assert.equal(await store.read("t2_test"), null);
    const start = Date.now();
    const saved = await store.change("t2_test", null, (data) => data, true);
    assert.deepEqual(saved?.favourites, ["pics", "space"]);
    assert.equal(saved?.state.compact, true);
    assert.deepEqual(saved?.state.seen, ["t3_abc"]);
    assert.equal(values.has("reader-state:t2_test"), false);
    assert.equal(hashes.has("favourites:t2_test"), false);
    const expiry = expirations.get("user-data:v1:t2_test")!;
    assert.ok(expiry >= start + USER_DATA_TTL_SECONDS * 1000 && expiry <= Date.now() + USER_DATA_TTL_SECONDS * 1000);
    await assert.rejects(store.change("t2_test", null, (data) => data), ConsentRequiredError);
  } catch (error) { throw error; }
});

test("deletion clears current and legacy data and revokes old tabs even after a fresh opt-in", async () => {
  try {
    const { store, values, hashes } = fixture();
    const saved = (await store.change("t2_test", null, (data) => data, true))!;
    hashes.set("favourites:t2_test", { pics: "pics" });
    values.set("reader-state:t2_test", "{}");
    await store.change("t2_test", saved.token, () => null, true);
    assert.equal(await store.read("t2_test"), null);
    assert.equal(values.size, 0);
    assert.equal(hashes.size, 0);
    await assert.rejects(store.change("t2_test", saved.token, (data) => data), ConsentRequiredError);
    const fresh = (await store.change("t2_test", null, (data) => data, true))!;
    assert.notEqual(fresh.token, saved.token);
    assert.deepEqual(fresh.favourites, []);
    await assert.rejects(store.change("t2_test", saved.token, (data) => data), ConsentRequiredError);
  } catch (error) { throw error; }
});

test("a save already in flight cannot resurrect data deleted before its transaction executes", async () => {
  try {
    const { store, interleave } = fixture();
    const saved = (await store.change("t2_test", null, (data) => data, true))!;
    interleave(async () => { try { await store.change("t2_test", saved.token, () => null, true); } catch (error) { throw error; } });
    await assert.rejects(store.change("t2_test", saved.token, (data) => ({ ...data, favourites: ["pics"] })), /changed in another tab/);
    assert.equal(await store.read("t2_test"), null);
  } catch (error) { throw error; }
});

test("legacy data can be deleted without opting in and access applies a bounded retention period", async () => {
  try {
    const { store, values, hashes, expirations } = fixture();
    hashes.set("favourites:t2_test", { pics: "pics" });
    values.set("reader-state:t2_test", "{}");
    await store.expireLegacy("t2_test");
    assert.ok(expirations.has("favourites:t2_test"));
    assert.ok(expirations.has("reader-state:t2_test"));
    await store.change("t2_test", null, () => null, true);
    assert.equal(values.size, 0);
    assert.equal(hashes.size, 0);
  } catch (error) { throw error; }
});
