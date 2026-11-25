/**
 * Neighborhood-rankings task 5. Pure: joins the refresh sources into one row per PLUTO building,
 * scores every building, and ranks those in residential neighborhoods.
 */
import { MIN_NEIGHBORHOOD_SIZE, rankWithinNeighborhoods } from "./rank";
import { score, type ViolationCounts } from "./score";
import type { NtaInfo, PlutoBuilding } from "./sources";

/** Why a building has, or lacks, a rank. Feeds the "not rankable" message (Requirement 1.2, 1.3). */
export type RankStatus =
  | "ranked"
  | "small_neighborhood"
  | "non_residential_nta"
  | "unknown_tract"
  | "no_tract";

export interface BuildingMetric {
  bbl: string;
  address: string;
  unitsRes: number;
  ntaCode: string | null;
  ntaName: string | null;
  violations: ViolationCounts;
  complaints: number;
  evictions: number;
  /** Computed for every building, ranked or not, so the report can show it. */
  score: number;
  status: RankStatus;
  /** Set only when status is "ranked". */
  rank: number | null;
  /** Rankable buildings in the neighborhood; null outside a residential neighborhood. */
  neighborhoodCount: number | null;
  /** Set only when status is "ranked". */
  moreHauntedThan: number | null;
}

export interface NeighborhoodSummary {
  ntaCode: string;
  ntaName: string;
  /** Borough digit "1" to "5", from the buildings' BBLs. */
  borough: string;
  count: number;
  medianScore: number;
  ranked: boolean;
}

export interface AssembleInput {
  pluto: ReadonlyMap<string, PlutoBuilding>;
  crosswalk: ReadonlyMap<string, NtaInfo>;
  violations: ReadonlyMap<string, ViolationCounts>;
  complaints: ReadonlyMap<string, number>;
  evictions: ReadonlyMap<string, number>;
}

export interface AssembleStats {
  byStatus: Record<RankStatus, number>;
  /**
   * Counts whose BBL matched no PLUTO building in the pull (buildings under 3 units, condo unit lots,
   * stale BBLs). Reported so the refresh log shows how much data does not join.
   */
  unmatched: { violations: number; complaints: number; evictions: number };
}

export interface AssembleResult {
  /** Sorted by BBL. */
  buildings: BuildingMetric[];
  /** Residential neighborhoods with at least one building, sorted by code. */
  neighborhoods: NeighborhoodSummary[];
  stats: AssembleStats;
}

const RESIDENTIAL_NTA_TYPE = "0";
const NO_VIOLATIONS: ViolationCounts = Object.freeze({ a: 0, b: 0, c: 0 });

export function median(sorted: readonly number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? (sorted[mid] as number) : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

function sumUnmatched(counts: ReadonlyMap<string, number>, pluto: ReadonlyMap<string, PlutoBuilding>): number {
  let total = 0;
  for (const [bbl, n] of counts) if (!pluto.has(bbl)) total += n;
  return total;
}

export function assembleRankings(input: AssembleInput, minNeighborhoodSize = MIN_NEIGHBORHOOD_SIZE): AssembleResult {
  const byStatus: Record<RankStatus, number> = {
    ranked: 0,
    small_neighborhood: 0,
    non_residential_nta: 0,
    unknown_tract: 0,
    no_tract: 0,
  };

  // 1. One row per PLUTO building, in BBL order so the output does not depend on Map insertion order.
  const rows: BuildingMetric[] = [];
  for (const bbl of [...input.pluto.keys()].sort()) {
    const b = input.pluto.get(bbl) as PlutoBuilding;
    const nta = b.tract === null ? undefined : input.crosswalk.get(b.tract);
    const violations = { ...(input.violations.get(bbl) ?? NO_VIOLATIONS) };
    const status: RankStatus =
      b.tract === null ? "no_tract" : nta === undefined ? "unknown_tract" : nta.ntaType !== RESIDENTIAL_NTA_TYPE ? "non_residential_nta" : "ranked";
    rows.push({
      bbl,
      address: b.address,
      unitsRes: b.unitsRes,
      ntaCode: nta?.ntaCode ?? null,
      ntaName: nta?.ntaName ?? null,
      violations,
      complaints: input.complaints.get(bbl) ?? 0,
      evictions: input.evictions.get(bbl) ?? 0,
      score: score(violations, b.unitsRes),
      status,
      rank: null,
      neighborhoodCount: null,
      moreHauntedThan: null,
    });
  }

  // 2. Rank buildings in residential neighborhoods. "ranked" above means "eligible" until this step.
  const eligible = rows.filter((r) => r.status === "ranked");
  const ranked = new Map(
    rankWithinNeighborhoods(
      eligible.map((r) => ({ bbl: r.bbl, ntaCode: r.ntaCode as string, score: r.score })),
      minNeighborhoodSize,
    ).map((r) => [r.bbl, r]),
  );
  for (const r of eligible) {
    const k = ranked.get(r.bbl);
    if (k === undefined) continue;
    r.neighborhoodCount = k.count;
    r.rank = k.rank;
    r.moreHauntedThan = k.moreHauntedThan;
    if (k.rank === null) r.status = "small_neighborhood";
  }
  for (const r of rows) byStatus[r.status]++;

  // 3. Neighborhood summaries (Requirement 2.2).
  const groups = new Map<string, BuildingMetric[]>();
  for (const r of eligible) {
    const g = groups.get(r.ntaCode as string);
    if (g) g.push(r);
    else groups.set(r.ntaCode as string, [r]);
  }
  const neighborhoods: NeighborhoodSummary[] = [...groups.keys()].sort().map((code) => {
    const g = groups.get(code) as BuildingMetric[];
    const first = g[0] as BuildingMetric;
    return {
      ntaCode: code,
      ntaName: first.ntaName as string,
      borough: first.bbl.slice(0, 1),
      count: g.length,
      medianScore: median(g.map((r) => r.score).sort((x, y) => x - y)),
      ranked: g.length >= minNeighborhoodSize,
    };
  });

  // 4. Data that did not join to any building.
  let unmatchedViolations = 0;
  for (const [bbl, c] of input.violations) if (!input.pluto.has(bbl)) unmatchedViolations += c.a + c.b + c.c;

  return {
    buildings: rows,
    neighborhoods,
    stats: {
      byStatus,
      unmatched: {
        violations: unmatchedViolations,
        complaints: sumUnmatched(input.complaints, input.pluto),
        evictions: sumUnmatched(input.evictions, input.pluto),
      },
    },
  };
}
