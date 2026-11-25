/** Neighborhood-rankings Requirement 3 (decision D2). Pure. */

/** Bump when the weights, inputs or window change, so stored rankings say which formula made them. */
export const FORMULA_VERSION = "v1:hpd-violations:c3-b2-a1:per-unit:36m";

const WEIGHTS = { a: 1, b: 2, c: 3 } as const;

/** HPD violations in the ranking window, by class. */
export interface ViolationCounts {
  a: number;
  b: number;
  c: number;
}

function isCount(n: number): boolean {
  return Number.isSafeInteger(n) && n >= 0;
}

/**
 * Weighted violations per residential unit: (3C + 2B + A) / units.
 * Weights are integers, so the numerator is an exact integer, and IEEE division is correctly
 * rounded: equal ratios (2/6 and 1/3) give the same double, which keeps ties exact for ranking.
 * Throws RangeError on invalid input. Callers only score rankable buildings (3+ units).
 */
export function score(counts: ViolationCounts, unitsRes: number): number {
  if (!isCount(counts.a) || !isCount(counts.b) || !isCount(counts.c)) {
    throw new RangeError("Violation counts must be non-negative integers");
  }
  if (!Number.isSafeInteger(unitsRes) || unitsRes < 1) {
    throw new RangeError("Residential units must be a positive integer");
  }
  return (WEIGHTS.c * counts.c + WEIGHTS.b * counts.b + WEIGHTS.a * counts.a) / unitsRes;
}
