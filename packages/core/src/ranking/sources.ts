/**
 * Refresh sources for neighborhood rankings (tasks 4.1 to 4.5). Each fetches with the Socrata client,
 * normalizes identifiers at the edge (data-conventions), and reports rows received and rows dropped.
 */
import { normalizeBbl } from "../identifiers";
import { socrataPages, socrataQueryAll, soqlString, type Row, type SocrataOptions, type SocrataResult } from "../socrata";
import type { DateWindow } from "./refresh-guards";
import type { ViolationCounts } from "./score";

export const DATASETS = {
  crosswalk: "hm78-6dwm",
  pluto: "64uk-42ks",
  violations: "wvxf-dwi5",
  complaints: "ygpa-z7cr",
  evictions: "6z8x-wfk4",
} as const;

export type SourceName = keyof typeof DATASETS;

/** Borough names as HPD violations (`boro`) and HPD complaints (`borough`) store them. */
const BOROUGH_NAMES = ["MANHATTAN", "BRONX", "BROOKLYN", "QUEENS", "STATEN ISLAND"] as const;

export const MIN_RANKABLE_UNITS = 3;

export interface SourceData<T> {
  data: T;
  /** Rows received from Socrata, for the shrink guard (Requirement 4.3). */
  rowCount: number;
  /** Rows discarded because an identifier or number was unusable (for example `bbl` of "0"). */
  dropped: number;
}

export interface NtaInfo {
  ntaCode: string;
  ntaName: string;
  /** "0" is residential. */
  ntaType: string;
}

export interface PlutoBuilding {
  bbl: string;
  address: string;
  unitsRes: number;
  /** 2020 borough + tract (`bct2020`), or null when PLUTO has none. */
  tract: string | null;
}

type Result<T> = SocrataResult<SourceData<T>>;

const TRACT = /^[1-5]\d{6}$/;

function str(x: unknown): string | null {
  return typeof x === "string" && x.trim() !== "" ? x.trim() : null;
}

/** A non-negative integer count. Strings must be all digits: Number("") and Number(" ") are 0. */
function count(x: unknown): number | null {
  const n = typeof x === "string" ? (/^\d+$/.test(x) ? Number(x) : Number.NaN) : typeof x === "number" ? x : Number.NaN;
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
}

/** Same rule for PLUTO's `unitsres`. */
function units(x: unknown): number | null {
  return count(x);
}

/** `[start, end]` inclusive on civil dates, against a Socrata floating timestamp column. */
export function windowClause(column: string, w: DateWindow): string {
  return `${column} >= ${soqlString(w.start)} AND ${column} <= ${soqlString(`${w.end}T23:59:59.999`)}`;
}

// ---------- 4.1 NTA crosswalk ----------

export function parseCrosswalk(rows: Row[]): SourceData<Map<string, NtaInfo>> {
  const data = new Map<string, NtaInfo>();
  let dropped = 0;
  for (const r of rows) {
    const tract = str(r.boroct2020);
    const ntaCode = str(r.ntacode);
    const ntaName = str(r.ntaname);
    const ntaType = str(r.ntatype);
    if (!tract || !TRACT.test(tract) || !ntaCode || !ntaName || !ntaType) {
      dropped++;
      continue;
    }
    data.set(tract, { ntaCode, ntaName, ntaType });
  }
  return { data, rowCount: rows.length, dropped };
}

export async function fetchCrosswalk(opts: SocrataOptions): Promise<Result<Map<string, NtaInfo>>> {
  const res = await socrataPages(
    DATASETS.crosswalk,
    { $select: "boroct2020, ntacode, ntaname, ntatype", $order: "boroct2020" },
    "crosswalk",
    opts,
  );
  return res.kind === "error" ? res : { kind: "ok", data: parseCrosswalk(res.data) };
}

// ---------- 4.2 PLUTO ----------

export function parsePluto(rows: Row[]): SourceData<Map<string, PlutoBuilding>> {
  const data = new Map<string, PlutoBuilding>();
  let dropped = 0;
  for (const r of rows) {
    const bbl = normalizeBbl(r.bbl);
    const unitsRes = units(r.unitsres);
    if (bbl === null || unitsRes === null || unitsRes < MIN_RANKABLE_UNITS) {
      dropped++;
      continue;
    }
    const tract = str(r.bct2020);
    data.set(bbl, { bbl, address: str(r.address) ?? "", unitsRes, tract: tract && TRACT.test(tract) ? tract : null });
  }
  return { data, rowCount: rows.length, dropped };
}

export async function fetchPluto(opts: SocrataOptions & { pageSize?: number }): Promise<Result<Map<string, PlutoBuilding>>> {
  const res = await socrataPages(
    DATASETS.pluto,
    { $select: "bbl, address, unitsres, bct2020", $where: `unitsres >= ${MIN_RANKABLE_UNITS}`, $order: "bbl" },
    "pluto",
    opts,
  );
  return res.kind === "error" ? res : { kind: "ok", data: parsePluto(res.data) };
}

// ---------- 4.3 to 4.5 grouped counts ----------

/** Adds `bbl, class, n` rows into per-building counts. Class I (information orders) is not scored. */
export function addViolationRows(into: Map<string, ViolationCounts>, rows: Row[]): number {
  let dropped = 0;
  for (const r of rows) {
    const bbl = normalizeBbl(r.bbl);
    const n = count(r.n);
    const cls = str(r.class)?.toUpperCase();
    if (bbl === null || n === null) {
      dropped++;
      continue;
    }
    if (cls !== "A" && cls !== "B" && cls !== "C") continue;
    const key = cls.toLowerCase() as keyof ViolationCounts;
    const c = into.get(bbl) ?? { a: 0, b: 0, c: 0 };
    c[key] += n;
    into.set(bbl, c);
  }
  return dropped;
}

/** Adds `bbl, n` rows into per-building counts. Sums, because one BBL can appear under two borough queries. */
export function addCountRows(into: Map<string, number>, rows: Row[]): number {
  let dropped = 0;
  for (const r of rows) {
    const bbl = normalizeBbl(r.bbl);
    const n = count(r.n);
    if (bbl === null || n === null) {
      dropped++;
      continue;
    }
    into.set(bbl, (into.get(bbl) ?? 0) + n);
  }
  return dropped;
}

/** Runs one grouped query per borough, in sequence, and merges the rows. */
async function perBorough<T>(
  run: (borough: string) => Promise<SocrataResult<Row[]>>,
  into: T,
  add: (into: T, rows: Row[]) => number,
): Promise<Result<T>> {
  let rowCount = 0;
  let dropped = 0;
  for (const borough of BOROUGH_NAMES) {
    const res = await run(borough);
    if (res.kind === "error") return { ...res, message: `${borough}: ${res.message}` };
    rowCount += res.data.length;
    dropped += add(into, res.data);
  }
  return { kind: "ok", data: { data: into, rowCount, dropped } };
}

export function fetchViolationCounts(w: DateWindow, opts: SocrataOptions): Promise<Result<Map<string, ViolationCounts>>> {
  return perBorough(
    (borough) =>
      socrataQueryAll(
        DATASETS.violations,
        {
          $select: "bbl, class, count(*) as n",
          $where: `boro = ${soqlString(borough)} AND ${windowClause("inspectiondate", w)}`,
          $group: "bbl, class",
        },
        "violations",
        opts,
      ),
    new Map<string, ViolationCounts>(),
    addViolationRows,
  );
}

/** Distinct complaints, not problems: the dataset has one row per problem within a complaint. */
export function fetchComplaintCounts(w: DateWindow, opts: SocrataOptions): Promise<Result<Map<string, number>>> {
  return perBorough(
    (borough) =>
      socrataQueryAll(
        DATASETS.complaints,
        {
          $select: "bbl, count(distinct complaint_id) as n",
          $where: `borough = ${soqlString(borough)} AND ${windowClause("received_date", w)}`,
          $group: "bbl",
        },
        "complaints",
        opts,
      ),
    new Map<string, number>(),
    addCountRows,
  );
}

/** Executed residential evictions. Small enough for one citywide query. */
export async function fetchEvictionCounts(w: DateWindow, opts: SocrataOptions): Promise<Result<Map<string, number>>> {
  const res = await socrataQueryAll(
    DATASETS.evictions,
    {
      $select: "bbl, count(*) as n",
      $where: `residential_commercial_ind = ${soqlString("Residential")} AND ${windowClause("executed_date", w)}`,
      $group: "bbl",
    },
    "evictions",
    opts,
  );
  if (res.kind === "error") return res;
  const data = new Map<string, number>();
  const dropped = addCountRows(data, res.data);
  return { kind: "ok", data: { data, rowCount: res.data.length, dropped } };
}
