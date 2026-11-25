import type { BblParts } from "./types";

const BOROUGHS: Record<string, string> = {
  MANHATTAN: "1",
  BRONX: "2",
  BROOKLYN: "3",
  QUEENS: "4",
  "STATEN ISLAND": "5",
};

/**
 * Reduce a string or number to a plain digit string, or null.
 * Accepts float strings whose fractional part is all zeros ("1015500031.00000000").
 */
function toDigits(input: unknown): string | null {
  if (typeof input === "number") {
    if (!Number.isSafeInteger(input) || input < 0) return null;
    return String(input);
  }
  if (typeof input !== "string") return null;
  const m = /^\s*(\d+)(?:\.0*)?\s*$/.exec(input);
  return m ? (m[1] as string) : null;
}

/** Borough name (any case) or digit "1" to "5" to a borough code, else null. */
export function boroughCode(input: unknown): string | null {
  if (typeof input === "number") input = String(input);
  if (typeof input !== "string") return null;
  const s = input.trim().toUpperCase();
  if (/^[1-5]$/.test(s)) return s;
  return BOROUGHS[s] ?? null;
}

function padNumber(input: unknown, width: number): string | null {
  const digits = toDigits(input);
  if (digits === null) return null;
  const n = Number(digits);
  if (!Number.isSafeInteger(n) || n >= 10 ** width) return null;
  return String(n).padStart(width, "0");
}

/** Compose a 10-digit BBL from borough, block and lot. Block and lot may be padded or unpadded. */
export function composeBbl(borough: unknown, block: unknown, lot: unknown): string | null {
  const b = boroughCode(borough);
  const bl = padNumber(block, 5);
  const l = padNumber(lot, 4);
  if (b === null || bl === null || l === null) return null;
  return b + bl + l;
}

/** Normalize a BBL given as digit string, float string or number. Returns a 10-digit string, or null. */
export function normalizeBbl(input: unknown): string | null {
  const digits = toDigits(input);
  if (digits === null || digits.length !== 10 || !/^[1-5]/.test(digits)) return null;
  return digits;
}

export function parseBbl(input: unknown): BblParts | null {
  const bbl = normalizeBbl(input);
  if (bbl === null) return null;
  return { borough: bbl.slice(0, 1), block: bbl.slice(1, 6), lot: bbl.slice(6) };
}

/** Normalize a BIN to 7 digits. Placeholder BINs (1000000 to 5000000, multiples of a million) become null. */
export function normalizeBin(input: unknown): string | null {
  const digits = toDigits(input);
  if (digits === null || digits.length !== 7) return null;
  if (/^[1-5]000000$/.test(digits)) return null;
  return digits;
}
