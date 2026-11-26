/**
 * The six report sources (building-dossier task 3). Each `$select` lists only shown columns, so names of
 * owners, marshals, applicants and evicted tenants' apartments are never fetched (Requirement 4.1).
 */
import { windowClause } from "../ranking/sources";
import { soqlString, type Row } from "../socrata";
import { inWindow, socrataCivilDate, usSlashDate } from "./dates";
import type { Adapter, DossierQuery } from "./run";
import { buildingClassLabel, categoryLabel, dobJobLabel, sentenceCase, violationText } from "./text";

const str = (x: unknown): string | null => (typeof x === "string" && x.trim() !== "" ? x.trim() : null);
const count = (x: unknown): number => {
  const n = typeof x === "string" && /^\d+$/.test(x.trim()) ? Number(x) : typeof x === "number" && Number.isSafeInteger(x) && x >= 0 ? x : 0;
  return n;
};
const positive = (x: unknown): number | null => {
  const n = typeof x === "string" ? Number(x) : typeof x === "number" ? x : Number.NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
};
const rows = (b: Row[] | null | undefined): Row[] => (Array.isArray(b) ? b.filter((r) => typeof r === "object" && r !== null) : []);
const byBbl = (bbl: string) => `bbl = ${soqlString(bbl)}`;

// ---------- 3.1 PLUTO ----------

export interface BuildingFacts {
  yearBuilt: number | null;
  floors: number | null;
  unitsRes: number | null;
  unitsTotal: number | null;
  buildingClass: string | null;
  buildingClassLabel: string | null;
}

export const plutoAdapter: Adapter<"pluto", BuildingFacts | null> = {
  source: "pluto",
  queries: (b) => [{ dataset: "64uk-42ks", params: { $select: "yearbuilt, numfloors, unitsres, unitstotal, bldgclass", $where: byBbl(b.bbl) } }],
  parse: ([body]) => {
    const r = rows(body)[0];
    if (!r) return { data: null, rowCount: 0 };
    const floors = positive(r.numfloors);
    const year = positive(r.yearbuilt);
    const units = (x: unknown) => (positive(x) === null ? (count(x) === 0 && x !== undefined ? 0 : null) : Math.round(positive(x) as number));
    const cls = str(r.bldgclass);
    return {
      data: {
        yearBuilt: year !== null && year >= 1600 ? Math.round(year) : null,
        floors: floors === null ? null : Math.round(floors * 10) / 10,
        unitsRes: units(r.unitsres),
        unitsTotal: units(r.unitstotal),
        buildingClass: cls,
        buildingClassLabel: buildingClassLabel(cls),
      },
      rowCount: 1,
    };
  },
};

// ---------- 3.2 HPD violations ----------

export interface OpenViolation {
  id: string;
  class: string;
  inspectedOn: string | null;
  text: string;
  status: string | null;
  rentImpairing: boolean;
}

export interface Violations {
  open: { a: number; b: number; c: number; other: number };
  openTotal: number;
  recent: OpenViolation[];
}

export const RECENT_VIOLATIONS = 20;

export const violationsAdapter: Adapter<"violations", Violations> = {
  source: "violations",
  queries: (b): DossierQuery[] => {
    const where = `${byBbl(b.bbl)} AND violationstatus = 'Open'`;
    return [
      { dataset: "wvxf-dwi5", params: { $select: "class, count(*) as n", $where: where, $group: "class" } },
      {
        dataset: "wvxf-dwi5",
        params: {
          $select: "violationid, class, inspectiondate, novdescription, currentstatus, rentimpairing",
          $where: where,
          $order: "inspectiondate DESC, violationid DESC",
          $limit: String(RECENT_VIOLATIONS),
        },
      },
    ];
  },
  parse: ([summary, recent]) => {
    const open = { a: 0, b: 0, c: 0, other: 0 };
    for (const r of rows(summary)) {
      const cls = (str(r.class) ?? "").toUpperCase();
      const key = cls === "A" || cls === "B" || cls === "C" ? (cls.toLowerCase() as "a" | "b" | "c") : "other";
      open[key] += count(r.n);
    }
    const openTotal = open.a + open.b + open.c + open.other;
    return {
      data: {
        open,
        openTotal,
        recent: rows(recent).map((r) => ({
          id: str(r.violationid) ?? "",
          class: (str(r.class) ?? "?").toUpperCase(),
          inspectedOn: socrataCivilDate(r.inspectiondate),
          text: violationText(str(r.novdescription) ?? "No description"),
          status: str(r.currentstatus) === null ? null : sentenceCase(str(r.currentstatus) as string),
          rentImpairing: (str(r.rentimpairing) ?? "").toUpperCase() === "Y",
        })),
      },
      rowCount: openTotal,
    };
  },
};

// ---------- 3.3 HPD complaints ----------

export interface Complaints {
  /** Distinct complaints per category in the window. One complaint can list several categories. */
  byCategory: { category: string; label: string; count: number }[];
  open: number;
}

export const complaintsAdapter: Adapter<"complaints", Complaints> = {
  source: "complaints",
  queries: (b, w): DossierQuery[] => [
    {
      dataset: "ygpa-z7cr",
      params: {
        $select: "major_category, count(distinct complaint_id) as n",
        $where: `${byBbl(b.bbl)} AND ${windowClause("received_date", w)}`,
        $group: "major_category",
        $order: "n DESC",
      },
    },
    {
      dataset: "ygpa-z7cr",
      params: { $select: "count(distinct complaint_id) as n", $where: `${byBbl(b.bbl)} AND complaint_status = 'OPEN'` },
    },
  ],
  parse: ([cats, open]) => {
    const byCategory = rows(cats)
      .map((r) => ({ category: str(r.major_category) ?? "", label: categoryLabel(str(r.major_category)), count: count(r.n) }))
      .filter((c) => c.count > 0)
      .sort((x, y) => y.count - x.count || x.label.localeCompare(y.label));
    const openCount = count(rows(open)[0]?.n);
    return { data: { byCategory, open: openCount }, rowCount: byCategory.reduce((s, c) => s + c.count, 0) + openCount };
  },
};

// ---------- 3.4 311 ----------

export interface ServiceRequests {
  top: { type: string; label: string; count: number }[];
}

export const TOP_311 = 10;

export const serviceRequestsAdapter: Adapter<"service_requests", ServiceRequests> = {
  source: "service_requests",
  queries: (b, w) => [
    {
      dataset: "erm2-nwe9",
      params: {
        $select: "complaint_type, count(*) as n",
        $where: `${byBbl(b.bbl)} AND ${windowClause("created_date", w)}`,
        $group: "complaint_type",
        $order: "n DESC",
        $limit: String(TOP_311),
      },
    },
  ],
  parse: ([body]) => {
    const top = rows(body)
      .map((r) => ({ type: str(r.complaint_type) ?? "", label: categoryLabel(str(r.complaint_type)), count: count(r.n) }))
      .filter((t) => t.count > 0)
      .sort((x, y) => y.count - x.count || x.label.localeCompare(y.label))
      .slice(0, TOP_311);
    return { data: { top }, rowCount: top.reduce((s, t) => s + t.count, 0) };
  },
};

// ---------- 3.5 Evictions ----------

export interface Evictions {
  inWindow: number;
  total: number;
  mostRecent: string | null;
}

export const evictionsAdapter: Adapter<"evictions", Evictions> = {
  source: "evictions",
  queries: (b) => [
    {
      dataset: "6z8x-wfk4",
      // Dates only: no docket numbers, apartments or marshal names (Requirement 4).
      params: {
        $select: "executed_date",
        $where: `${byBbl(b.bbl)} AND residential_commercial_ind = 'Residential'`,
        $order: "executed_date DESC",
        $limit: "1000",
      },
    },
  ],
  parse: ([body], _b, w) => {
    const dates = rows(body)
      .map((r) => socrataCivilDate(r.executed_date))
      .filter((d): d is string => d !== null)
      .sort()
      .reverse();
    return {
      data: { inWindow: dates.filter((d) => inWindow(d, w)).length, total: dates.length, mostRecent: dates[0] ?? null },
      rowCount: dates.length,
    };
  },
};

// ---------- 3.6 DOB permits ----------

export interface Permit {
  system: "DOB" | "DOB NOW";
  id: string;
  date: string | null;
  label: string;
  status: string | null;
}

export interface Permits {
  recent: Permit[];
  total: number;
  /** "building" when looked up by BIN; "lot" (every building on the tax lot) when there was no BIN. */
  scope: "building" | "lot";
  /** Which permit system didn't answer. The legacy dataset often times out (docs/data-sources.md). */
  unavailable: ("DOB" | "DOB NOW")[];
}

export const RECENT_PERMITS = 10;

export const permitsAdapter: Adapter<"permits", Permits> = {
  source: "permits",
  queries: (b): DossierQuery[] => {
    // By building when the BIN is known; otherwise by tax lot (Requirement 2.3).
    const legacyWhere = b.bin === null ? byBbl(b.bbl) : `bin__ = ${soqlString(b.bin)}`;
    const nowWhere = b.bin === null ? byBbl(b.bbl) : `bin = ${soqlString(b.bin)}`;
    return [
      {
        dataset: "ipu4-2q9a",
        optional: true,
        // issuance_date is text "MM/DD/YYYY", so it can't be sorted in SoQL; fetch and sort here.
        params: { $select: "job__, job_type, work_type, permit_status, issuance_date, filing_date", $where: legacyWhere, $limit: "500" },
      },
      {
        dataset: "w9ak-ipjd",
        optional: true,
        params: {
          $select: "job_filing_number, job_type, filing_status, filing_date, first_permit_date",
          $where: nowWhere,
          $order: "filing_date DESC",
          $limit: "200",
        },
      },
    ];
  },
  parse: ([legacy, dobNow], b) => {
    const items: Permit[] = [
      ...rows(legacy).map((r) => ({
        system: "DOB" as const,
        id: str(r.job__) ?? "",
        date: usSlashDate(r.issuance_date) ?? usSlashDate(r.filing_date),
        label: dobJobLabel(str(r.job_type), str(r.work_type)),
        status: str(r.permit_status) === null ? null : sentenceCase(str(r.permit_status) as string),
      })),
      ...rows(dobNow).map((r) => ({
        system: "DOB NOW" as const,
        id: str(r.job_filing_number) ?? "",
        date: socrataCivilDate(r.first_permit_date) ?? socrataCivilDate(r.filing_date),
        label: dobJobLabel(str(r.job_type)),
        status: str(r.filing_status),
      })),
    ];
    items.sort((x, y) => (y.date ?? "").localeCompare(x.date ?? "") || x.id.localeCompare(y.id));
    const unavailable: Permits["unavailable"] = [];
    if (legacy === null) unavailable.push("DOB");
    if (dobNow === null) unavailable.push("DOB NOW");
    return {
      data: { recent: items.slice(0, RECENT_PERMITS), total: items.length, scope: b.bin === null ? "lot" : "building", unavailable },
      rowCount: items.length,
    };
  },
};

export const ADAPTERS = {
  pluto: plutoAdapter,
  violations: violationsAdapter,
  complaints: complaintsAdapter,
  service_requests: serviceRequestsAdapter,
  evictions: evictionsAdapter,
  permits: permitsAdapter,
} as const;
