/** Civil dates from Socrata (building-dossier task 2.4). Pure. Results are `YYYY-MM-DD` or null. */

function isRealDate(y: number, m: number, d: number): boolean {
  if (!Number.isInteger(y) || y < 1800 || y > 2200 || m < 1 || m > 12 || d < 1) return false;
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1] as number;
  return d <= days;
}

const pad = (n: number, w: number) => String(n).padStart(w, "0");

/**
 * A Socrata floating timestamp ("2026-09-16T00:00:00.000") or date ("2026-09-16") as its civil date.
 * Floating timestamps are New York civil time already, so the date part is taken as is (data-conventions).
 */
export function socrataCivilDate(x: unknown): string | null {
  if (typeof x !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T[\d:.]+)?$/.exec(x.trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return isRealDate(y, mo, d) ? `${pad(y, 4)}-${pad(mo, 2)}-${pad(d, 2)}` : null;
}

/** DOB legacy permits store dates as text "MM/DD/YYYY". */
export function usSlashDate(x: unknown): string | null {
  if (typeof x !== "string") return null;
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(x.trim());
  if (!m) return null;
  const [mo, d, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return isRealDate(y, mo, d) ? `${pad(y, 4)}-${pad(mo, 2)}-${pad(d, 2)}` : null;
}

/** Inclusive check on civil dates; string comparison works because both are `YYYY-MM-DD`. */
export function inWindow(date: string | null, w: { start: string; end: string }): boolean {
  return date !== null && date >= w.start && date <= w.end;
}
