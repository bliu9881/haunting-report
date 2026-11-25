/** Request path for a building's ranking (neighborhood-rankings Requirement 1, task 8). Never throws. */
import { normalizeBbl, type BuildingMetric, type SourceError } from "@haunting/core";
import type { PublishedRanking, RankingStore } from "./types";

export const RANKING_TIMEOUT_MS = 3000;

export type NotRankableReason =
  | "no_rankings_yet"
  | "not_in_rankings" // fewer than 3 residential units, or not in PLUTO
  | "small_neighborhood"
  | "non_residential_nta"
  | "no_tract"
  | "unknown_tract";

export type RankingLookup =
  | {
      kind: "ranked";
      building: BuildingMetric & { rank: number; neighborhoodCount: number; moreHauntedThan: number; ntaCode: string; ntaName: string };
      /** Null only if the neighborhood row is missing. */
      neighborhoodMedian: number | null;
      asOf: PublishedRanking;
    }
  | { kind: "not_rankable"; reason: NotRankableReason; building: BuildingMetric | null; asOf: PublishedRanking | null }
  | SourceError<"rankings">;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new RankingTimeout(ms)), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

class RankingTimeout extends Error {
  constructor(ms: number) {
    super(`Rankings lookup timed out after ${ms} ms`);
  }
}

export async function getRanking(store: RankingStore, bblInput: string, timeoutMs = RANKING_TIMEOUT_MS): Promise<RankingLookup> {
  const bbl = normalizeBbl(bblInput);
  try {
    return await withTimeout(lookup(store, bbl), timeoutMs);
  } catch (err) {
    const timedOut = err instanceof RankingTimeout;
    return {
      kind: "error",
      source: "rankings",
      reason: timedOut ? "timeout" : "network",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

async function lookup(store: RankingStore, bbl: string | null): Promise<RankingLookup> {
  const [asOf, building] = await Promise.all([store.published(), bbl === null ? null : store.getBuilding(bbl)]);
  if (asOf === null) return { kind: "not_rankable", reason: "no_rankings_yet", building: null, asOf: null };
  if (building === null) return { kind: "not_rankable", reason: "not_in_rankings", building: null, asOf };
  if (
    building.status !== "ranked" ||
    building.rank === null ||
    building.neighborhoodCount === null ||
    building.moreHauntedThan === null ||
    building.ntaCode === null ||
    building.ntaName === null
  ) {
    const reason = building.status === "ranked" ? "unknown_tract" : building.status;
    return { kind: "not_rankable", reason, building, asOf };
  }
  const neighborhood = await store.getNeighborhood(building.ntaCode);
  return {
    kind: "ranked",
    building: {
      ...building,
      rank: building.rank,
      neighborhoodCount: building.neighborhoodCount,
      moreHauntedThan: building.moreHauntedThan,
      ntaCode: building.ntaCode,
      ntaName: building.ntaName,
    },
    neighborhoodMedian: neighborhood?.medianScore ?? null,
    asOf,
  };
}
