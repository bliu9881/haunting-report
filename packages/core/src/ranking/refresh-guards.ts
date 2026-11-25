/** Neighborhood-rankings Requirements 3.4 (window) and 4.3 (shrink guard). Pure. */

export const WINDOW_YEARS = 3;
export const MIN_ROW_RATIO = 0.8;

export interface DateWindow {
  /** Inclusive, New York civil date `YYYY-MM-DD`. */
  start: string;
  /** Inclusive, New York civil date `YYYY-MM-DD`. */
  end: string;
}

function isLeap(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

/**
 * The 36 months ending on `end`, a civil date `YYYY-MM-DD` (data-conventions: never via UTC).
 * 29 February maps to 28 February in a non-leap start year. Returns null for an invalid date.
 */
export function rankingWindow(end: string): DateWindow | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(end);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const monthDays = [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (y < 1000 || mo < 1 || mo > 12 || d < 1 || d > (monthDays[mo - 1] as number)) return null;
  const sy = y - WINDOW_YEARS;
  const sd = mo === 2 && d === 29 && !isLeap(sy) ? 28 : d;
  const pad = (n: number, w: number) => String(n).padStart(w, "0");
  return { start: `${pad(sy, 4)}-${pad(mo, 2)}-${pad(sd, 2)}`, end };
}

/**
 * Sources whose row count fell below 80% of the last successful refresh (Requirement 4.3).
 * A source with no previous count is not checked. A source missing from `current` counts as 0.
 * Returned sorted, so the refresh error message is stable.
 */
export function shrunkSources(
  current: Readonly<Record<string, number>>,
  previous: Readonly<Record<string, number>> | null,
  minRatio = MIN_ROW_RATIO,
): string[] {
  if (previous === null) return [];
  return Object.keys(previous)
    .filter((src) => {
      const before = previous[src] as number;
      const now = current[src] ?? 0;
      return before > 0 && now < before * minRatio;
    })
    .sort();
}
