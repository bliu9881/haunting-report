/** Neighborhood-rankings Requirements 1.3 and 1.6. Pure. */

/** Neighborhoods with fewer rankable buildings than this get no ranks (Requirement 1.3). */
export const MIN_NEIGHBORHOOD_SIZE = 20;

export interface Scored {
  bbl: string;
  ntaCode: string;
  score: number;
}

export interface Ranked extends Scored {
  /** 1 is the most haunted. Equal scores share a rank (1, 2, 2, 4). Null when the neighborhood is too small. */
  rank: number | null;
  /** Rankable buildings in the neighborhood. */
  count: number;
  /** Share of buildings in the neighborhood with a strictly lower score, in [0, 1). Null when too small. */
  moreHauntedThan: number | null;
}

/**
 * Ranks buildings within their neighborhood by descending score (standard competition ranking).
 * Output order: by neighborhood code, then rank, then BBL, so it is deterministic.
 */
export function rankWithinNeighborhoods(buildings: readonly Scored[], minSize = MIN_NEIGHBORHOOD_SIZE): Ranked[] {
  const groups = new Map<string, Scored[]>();
  for (const b of buildings) {
    const g = groups.get(b.ntaCode);
    if (g) g.push(b);
    else groups.set(b.ntaCode, [b]);
  }

  const out: Ranked[] = [];
  for (const nta of [...groups.keys()].sort()) {
    const group = (groups.get(nta) as Scored[])
      .slice()
      .sort((x, y) => y.score - x.score || (x.bbl < y.bbl ? -1 : x.bbl > y.bbl ? 1 : 0));
    const count = group.length;
    const ranked = count >= minSize;

    // Walk runs of equal score once. Most buildings tie at 0, so a per-building scan would be O(n²).
    let start = 0;
    while (start < count) {
      const tieScore = (group[start] as Scored).score;
      let end = start;
      while (end + 1 < count && (group[end + 1] as Scored).score === tieScore) end++;
      const strictlyLower = count - 1 - end;
      for (let i = start; i <= end; i++) {
        out.push({
          ...(group[i] as Scored),
          count,
          rank: ranked ? start + 1 : null,
          moreHauntedThan: ranked ? strictlyLower / count : null,
        });
      }
      start = end + 1;
    }
  }
  return out;
}
