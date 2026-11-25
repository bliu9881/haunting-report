/** Display helpers. Pure. */

export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  const suffix = { 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th";
  return `${n}${suffix}`;
}

/** Rounded down, so the page never claims more than the data shows (0.999 is "99%", not "100%"). */
export function percentFloor(share: number): string {
  return `${Math.floor(share * 100)}%`;
}

export function count(n: number): string {
  return n.toLocaleString("en-US");
}

export function score(s: number): string {
  return s.toFixed(2);
}

/** An ISO instant as a New York calendar date, e.g. "Nov 25, 2026". */
export function nyDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric" }).format(
    new Date(iso),
  );
}

/** A civil date `YYYY-MM-DD` as "Nov 25, 2026", without any timezone shift. */
export function civilDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
}

/** Dataset labels for "data as of" lines. The tract crosswalk is static 2020 geography, so it is not listed. */
export const SOURCE_LABELS: Record<string, string> = {
  violations: "HPD violations",
  complaints: "HPD complaints",
  evictions: "Evictions",
  pluto: "Building facts (PLUTO)",
};
