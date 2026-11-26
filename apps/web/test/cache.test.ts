import { describe, expect, it, vi } from "vitest";
import fc from "fast-check";
import { createCache } from "../lib/cache";

type R = { kind: "ok"; n: number } | { kind: "error" };
const okOnly = (v: R) => v.kind === "ok";

function setup(maxEntries = 3, ttlMs = 1000) {
  let t = 0;
  const cache = createCache<R>({ maxEntries, ttlMs, shouldCache: okOnly, now: () => t });
  return { cache, advance: (ms: number) => (t += ms) };
}

describe("createCache (task 4)", () => {
  it("returns a cached value without loading again", async () => {
    const { cache } = setup();
    const load = vi.fn(async (): Promise<R> => ({ kind: "ok", n: 1 }));
    expect(await cache.get("a", load)).toEqual({ kind: "ok", n: 1 });
    expect(await cache.get("a", load)).toEqual({ kind: "ok", n: 1 });
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("loads again after the TTL", async () => {
    const { cache, advance } = setup(3, 1000);
    const load = vi.fn(async (): Promise<R> => ({ kind: "ok", n: 1 }));
    await cache.get("a", load);
    advance(999);
    await cache.get("a", load);
    expect(load).toHaveBeenCalledTimes(1);
    advance(1);
    await cache.get("a", load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("never caches a failure (Requirement 3.3)", async () => {
    const { cache } = setup();
    const load = vi.fn(async (): Promise<R> => ({ kind: "error" }));
    await cache.get("a", load);
    await cache.get("a", load);
    expect(load).toHaveBeenCalledTimes(2);
    expect(cache.size()).toBe(0);
  });

  it("does not cache a rejected load, and lets the next caller try again", async () => {
    const { cache } = setup();
    const load = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce({ kind: "ok", n: 2 });
    await expect(cache.get("a", load)).rejects.toThrow("boom");
    expect(await cache.get("a", load)).toEqual({ kind: "ok", n: 2 });
  });

  it("shares one load between concurrent callers (Requirement 3.4)", async () => {
    const { cache } = setup();
    let resolve!: (v: R) => void;
    const load = vi.fn(() => new Promise<R>((r) => (resolve = r)));
    const p1 = cache.get("a", load);
    const p2 = cache.get("a", load);
    resolve({ kind: "ok", n: 3 });
    expect(await Promise.all([p1, p2])).toEqual([
      { kind: "ok", n: 3 },
      { kind: "ok", n: 3 },
    ]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("evicts the least recently used entry, counting reads as use", async () => {
    const { cache } = setup(2);
    const load = (n: number) => async (): Promise<R> => ({ kind: "ok", n });
    await cache.get("a", load(1));
    await cache.get("b", load(2));
    await cache.get("a", load(99)); // a is now most recently used
    await cache.get("c", load(3)); // evicts b
    const reload = vi.fn(load(4));
    expect(await cache.get("a", reload)).toEqual({ kind: "ok", n: 1 });
    expect(await cache.get("b", reload)).toEqual({ kind: "ok", n: 4 });
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("rejects bad options", () => {
    expect(() => createCache({ maxEntries: 0, ttlMs: 1, shouldCache: () => true })).toThrow(RangeError);
    expect(() => createCache({ maxEntries: 1, ttlMs: 0, shouldCache: () => true })).toThrow(RangeError);
  });

  it("never holds more than maxEntries, and a hit always returns the last stored value for that key", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 5 }),
        fc.array(fc.tuple(fc.constantFrom("a", "b", "c", "d", "e", "f"), fc.nat(100), fc.boolean()), { maxLength: 40 }),
        async (max, ops) => {
          const cache = createCache<R>({ maxEntries: max, ttlMs: 1e9, shouldCache: okOnly, now: () => 0 });
          const last = new Map<string, R>();
          for (const [key, n, fail] of ops) {
            const value: R = fail ? { kind: "error" } : { kind: "ok", n };
            const got = await cache.get(key, async () => value);
            if (got !== value) expect(got).toEqual(last.get(key)); // a hit must be the stored value
            if (got === value && value.kind === "ok") last.set(key, value);
            expect(cache.size()).toBeLessThanOrEqual(max);
          }
        },
      ),
    );
  });
});
