/** Street-name comparison for the address checks (Requirement 1.11). Pure. */

const DIRECTIONS: Record<string, string> = {
  e: "east", east: "east",
  w: "west", west: "west",
  n: "north", north: "north",
  s: "south", south: "south",
};

/** Street-type words and "saint". "St" is both Street and Saint, so both are dropped. */
const DROPPED = new Set([
  "st", "street", "saint",
  "ave", "av", "avenue",
  "rd", "road",
  "pl", "place",
  "blvd", "boulevard",
  "dr", "drive",
  "ln", "lane",
  "ct", "court",
  "pkwy", "parkway",
  "ter", "terrace",
]);

const ALIASES: Record<string, string> = { bway: "broadway" };

export interface StreetTokens {
  names: string[];
  directions: string[];
}

export function streetTokens(street: string): StreetTokens {
  const names: string[] = [];
  const directions: string[] = [];
  const words = street
    .toLowerCase()
    .replace(/['’.]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((w) => w !== "");
  for (const raw of words) {
    const ordinal = /^(\d+)(st|nd|rd|th)$/.exec(raw);
    const word = ordinal ? (ordinal[1] as string) : (ALIASES[raw] ?? raw);
    const direction = DIRECTIONS[word];
    if (direction !== undefined) directions.push(direction);
    else if (!DROPPED.has(word)) {
      // Crude singular: "MARK'S", "MARKS" and "MARK" compare equal. Applied to both sides, so equality is preserved.
      names.push(/^[a-z]{3,}s$/.test(word) ? word.slice(0, -1) : word);
    }
  }
  return { names, directions };
}

/** True when the query has nothing left to compare after normalization ("St", "Avenue"). */
export function isBlankStreet(street: string): boolean {
  const t = streetTokens(street);
  return t.names.length === 0 && t.directions.length === 0;
}

/**
 * The query's name tokens are all in the candidate's, and every direction the query gives is the candidate's.
 * A query that omits the direction ("88th St") matches both EAST and WEST 88 STREET.
 */
export function streetMatches(query: string, candidate: string): boolean {
  const q = streetTokens(query);
  const c = streetTokens(candidate);
  return q.names.every((n) => c.names.includes(n)) && q.directions.every((d) => c.directions.includes(d));
}
