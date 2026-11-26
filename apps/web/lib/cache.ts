/**
 * In-memory LRU cache with a TTL and shared in-flight loads (building-dossier task 4, Requirement 3.3, 3.4).
 * Hostinger runs one long-lived Node process, so this survives between requests and resets on deploy.
 * Pure apart from the injected clock; no "server-only" import, so it can be unit-tested.
 */

export interface CacheOptions<V> {
  maxEntries: number;
  ttlMs: number;
  /** Only values that pass are stored. Failures are returned to the caller but never cached. */
  shouldCache: (value: V) => boolean;
  now?: () => number;
}

export interface Cache<V> {
  /** Returns the cached value, joins a load already in progress, or starts `load`. */
  get(key: string, load: () => Promise<V>): Promise<V>;
  size(): number;
  clear(): void;
}

export function createCache<V>(opts: CacheOptions<V>): Cache<V> {
  if (!Number.isSafeInteger(opts.maxEntries) || opts.maxEntries < 1) throw new RangeError("maxEntries must be a positive integer");
  if (!(opts.ttlMs > 0)) throw new RangeError("ttlMs must be positive");
  const now = opts.now ?? Date.now;
  // A Map keeps insertion order: re-inserting on every hit makes the first key the least recently used.
  const entries = new Map<string, { value: V; expires: number }>();
  const inFlight = new Map<string, Promise<V>>();

  function store(key: string, value: V) {
    entries.delete(key);
    entries.set(key, { value, expires: now() + opts.ttlMs });
    while (entries.size > opts.maxEntries) {
      const oldest = entries.keys().next().value as string;
      entries.delete(oldest);
    }
  }

  return {
    get(key, load) {
      const hit = entries.get(key);
      if (hit) {
        if (hit.expires > now()) {
          entries.delete(key);
          entries.set(key, hit); // most recently used
          return Promise.resolve(hit.value);
        }
        entries.delete(key);
      }
      const pending = inFlight.get(key);
      if (pending) return pending;

      const p = (async () => {
        try {
          const value = await load();
          if (opts.shouldCache(value)) store(key, value);
          return value;
        } finally {
          inFlight.delete(key);
        }
      })();
      inFlight.set(key, p);
      return p;
    },
    size: () => entries.size,
    clear: () => {
      entries.clear();
      inFlight.clear();
    },
  };
}
