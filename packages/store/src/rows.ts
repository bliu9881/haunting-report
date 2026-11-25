/** Pure conversion between app objects and database rows, plus the validation both stores share. */
import type { BuildingMetric, NeighborhoodSummary, RankStatus } from "@haunting/core";

export const RANK_STATUSES: readonly RankStatus[] = [
  "ranked",
  "small_neighborhood",
  "non_residential_nta",
  "unknown_tract",
  "no_tract",
];

/** Column order for `building_metric`. Inserts and selects both use it. */
export const BUILDING_COLUMNS = [
  "bbl",
  "address",
  "units_res",
  "nta_code",
  "nta_name",
  "viol_a",
  "viol_b",
  "viol_c",
  "complaints",
  "evictions",
  "score",
  "status",
  "nta_rank",
  "nta_count",
  "more_haunted_than",
] as const;

export const NEIGHBORHOOD_COLUMNS = ["nta_code", "nta_name", "borough", "building_count", "median_score", "ranked"] as const;

export const MAX_TEXT = 255;

export class InvalidRowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidRowError";
  }
}

const isCount = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && n >= 0;
const isFiniteNonNeg = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0;

/** Throws InvalidRowError. Both stores call it, so a bad row fails the same way in tests and in MariaDB. */
export function validateBuilding(b: BuildingMetric): void {
  const fail = (what: string) => {
    throw new InvalidRowError(`Building ${String(b.bbl)}: ${what}`);
  };
  if (typeof b.bbl !== "string" || !/^[1-5]\d{9}$/.test(b.bbl)) fail("bbl must be 10 digits");
  if (!isCount(b.unitsRes) || b.unitsRes < 1) fail("unitsRes must be a positive integer");
  for (const [k, v] of Object.entries({ ...b.violations, complaints: b.complaints, evictions: b.evictions })) {
    if (!isCount(v)) fail(`${k} must be a non-negative integer`);
  }
  if (!isFiniteNonNeg(b.score)) fail("score must be a finite non-negative number");
  if (!RANK_STATUSES.includes(b.status)) fail(`unknown status ${String(b.status)}`);
  if ((b.status === "ranked") !== (b.rank !== null)) fail("rank must be set exactly when status is ranked");
  if (b.rank !== null && (!isCount(b.rank) || b.rank < 1)) fail("rank must be a positive integer");
  if (b.neighborhoodCount !== null && !isCount(b.neighborhoodCount)) fail("neighborhoodCount must be a count");
  if (b.moreHauntedThan !== null && !(isFiniteNonNeg(b.moreHauntedThan) && b.moreHauntedThan < 1)) fail("moreHauntedThan must be in [0, 1)");
  if (b.ntaCode !== null && (b.ntaCode.length === 0 || b.ntaCode.length > 8)) fail("ntaCode must be 1 to 8 characters");
}

export function validateNeighborhood(n: NeighborhoodSummary): void {
  const fail = (what: string) => {
    throw new InvalidRowError(`Neighborhood ${String(n.ntaCode)}: ${what}`);
  };
  if (typeof n.ntaCode !== "string" || n.ntaCode.length === 0 || n.ntaCode.length > 8) fail("ntaCode must be 1 to 8 characters");
  if (!/^[1-5]$/.test(n.borough)) fail("borough must be 1 to 5");
  if (!isCount(n.count)) fail("count must be a count");
  if (!isFiniteNonNeg(n.medianScore)) fail("medianScore must be finite and non-negative");
}

const clip = (s: string) => (s.length > MAX_TEXT ? s.slice(0, MAX_TEXT) : s);

export function buildingToRow(b: BuildingMetric): unknown[] {
  return [
    b.bbl,
    clip(b.address),
    b.unitsRes,
    b.ntaCode,
    b.ntaName === null ? null : clip(b.ntaName),
    b.violations.a,
    b.violations.b,
    b.violations.c,
    b.complaints,
    b.evictions,
    b.score,
    b.status,
    b.rank,
    b.neighborhoodCount,
    b.moreHauntedThan,
  ];
}

type DbRow = Record<string, unknown>;

const num = (x: unknown): number => (typeof x === "number" ? x : Number(x));
const numOrNull = (x: unknown): number | null => (x === null || x === undefined ? null : num(x));
const strOrNull = (x: unknown): string | null => (x === null || x === undefined ? null : String(x));

export function rowToBuilding(r: DbRow): BuildingMetric {
  return {
    bbl: String(r.bbl),
    address: String(r.address),
    unitsRes: num(r.units_res),
    ntaCode: strOrNull(r.nta_code),
    ntaName: strOrNull(r.nta_name),
    violations: { a: num(r.viol_a), b: num(r.viol_b), c: num(r.viol_c) },
    complaints: num(r.complaints),
    evictions: num(r.evictions),
    score: num(r.score),
    status: String(r.status) as RankStatus,
    rank: numOrNull(r.nta_rank),
    neighborhoodCount: numOrNull(r.nta_count),
    moreHauntedThan: numOrNull(r.more_haunted_than),
  };
}

export function neighborhoodToRow(n: NeighborhoodSummary): unknown[] {
  return [n.ntaCode, clip(n.ntaName), n.borough, n.count, n.medianScore, n.ranked ? 1 : 0];
}

export function rowToNeighborhood(r: DbRow): NeighborhoodSummary {
  return {
    ntaCode: String(r.nta_code),
    ntaName: String(r.nta_name),
    borough: String(r.borough),
    count: num(r.building_count),
    medianScore: num(r.median_score),
    ranked: num(r.ranked) === 1,
  };
}

/** ISO instant → `YYYY-MM-DD HH:MM:SS.sss` in UTC, for DATETIME(3) columns. */
export function toSqlDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new InvalidRowError(`Invalid instant: ${iso}`);
  return d.toISOString().replace("T", " ").replace("Z", "");
}

/** DATETIME(3) string read with `dateStrings: true`, stored as UTC → ISO instant. */
export function fromSqlDateTime(s: unknown): string {
  return new Date(`${String(s).replace(" ", "T")}Z`).toISOString();
}

const CIVIL_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function assertCivilDate(s: string, what: string): void {
  if (!CIVIL_DATE.test(s)) throw new InvalidRowError(`${what} must be YYYY-MM-DD`);
}
