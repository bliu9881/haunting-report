import "server-only";
import type { NeighborhoodSummary, BuildingMetric } from "@haunting/core";
import { configFromEnv, createMariaStore, getRanking, type PublishedRanking, type RankingLookup, type RankingStore } from "@haunting/store";

// One pool per server process (Hostinger runs one long-lived process). Kept on globalThis so dev reloads reuse it.
const g = globalThis as { __hauntingStore?: Promise<RankingStore> };

function store(): Promise<RankingStore> {
  if (!g.__hauntingStore) {
    g.__hauntingStore = createMariaStore(configFromEnv()).catch((err) => {
      g.__hauntingStore = undefined; // don't cache a failed setup
      throw err;
    });
  }
  return g.__hauntingStore;
}

function unavailable(err: unknown): RankingLookup {
  return { kind: "error", source: "rankings", reason: "network", message: err instanceof Error ? err.message : String(err) };
}

export async function lookupRanking(bbl: string): Promise<RankingLookup> {
  try {
    return await getRanking(await store(), bbl);
  } catch (err) {
    return unavailable(err);
  }
}

export type NeighborhoodPage =
  | { kind: "ok"; neighborhood: NeighborhoodSummary; top: BuildingMetric[]; asOf: PublishedRanking | null }
  | { kind: "not_found" }
  | { kind: "error"; message: string };

export async function lookupNeighborhood(ntaCode: string, limit = 10): Promise<NeighborhoodPage> {
  try {
    const s = await store();
    const [neighborhood, top, asOf] = await Promise.all([s.getNeighborhood(ntaCode), s.topInNeighborhood(ntaCode, limit), s.published()]);
    if (neighborhood === null) return { kind: "not_found" };
    return { kind: "ok", neighborhood, top, asOf };
  } catch (err) {
    return { kind: "error", message: err instanceof Error ? err.message : String(err) };
  }
}
