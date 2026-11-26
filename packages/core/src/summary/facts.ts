/**
 * The facts the model sees (ai-summary Requirement 1.1). Pure.
 * Keys are named so two different counts can't be confused: "open now" versus "last 36 months".
 */
import type { BuildingFacts, Complaints, Evictions, Permits, ServiceRequests, Violations } from "../dossier/adapters";

export const SUMMARY_SECTIONS = ["ranking", "pluto", "violations", "complaints", "service_requests", "evictions", "permits"] as const;
export type SummarySection = (typeof SUMMARY_SECTIONS)[number];

export const MAX_RECENT_VIOLATIONS = 5;

export interface RankingFacts {
  ranked: true;
  rank: number;
  buildingsInNeighborhood: number;
  neighborhood: string;
  /** Floored, as the page shows it. */
  moreHauntedThanPercent: number;
  score: number;
  neighborhoodMedianScore: number | null;
}

export interface SummaryInput {
  address: string;
  window: { start: string; end: string };
  /** Absent when the ranking lookup failed. `{ ranked: false }` when the building isn't ranked. */
  ranking?: RankingFacts | { ranked: false; reason: string };
  pluto?: BuildingFacts | null;
  violations?: Violations;
  complaints?: Complaints;
  service_requests?: ServiceRequests;
  evictions?: Evictions;
  permits?: Permits;
}

export interface Facts {
  /** What the model receives, as JSON. */
  json: Record<string, unknown>;
  /** Every number that appears in `json`, for the number check. */
  numbers: Set<number>;
  /** Sections the model may cite. */
  loaded: Set<SummarySection>;
}

/**
 * Removes where in the building a violation is ("located at apt 2I, 2nd story, 1st apartment from north at east").
 * The renter needs the problem, not the unit, and unit numbers point at a household (Requirement 2.2).
 */
export function stripUnitReferences(text: string): string {
  return text
    .replace(/,?\s*(?:located\s+)?at\s+apt\.?\s+[\w-]+(?:,\s*[^,.]*?\bstory\b)?(?:,\s*[^,.]*?\bapartment from\s+\w+(?:\s+at\s+\w+)?)?/gi, "")
    .replace(/\bapt\.?\s+[\w-]+,?\s*/gi, "")
    .replace(/,?\s*\d+(?:st|nd|rd|th)\s+story\b/gi, "")
    .replace(/,?\s*\d+(?:st|nd|rd|th)\s+apartment from\s+\w+(?:\s+at\s+\w+)?/gi, "")
    .replace(/\s+([,.])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .replace(/[,\s]+$/, "")
    .trim();
}

function addNumbersFrom(value: unknown, into: Set<number>): void {
  if (typeof value === "number" && Number.isFinite(value)) {
    into.add(value);
    return;
  }
  if (typeof value === "string") {
    const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (date) {
      into.add(Number(date[1]));
      into.add(Number(date[2]));
      into.add(Number(date[3]));
      return;
    }
    for (const m of value.matchAll(/\d+(?:\.\d+)?/g)) into.add(Number(m[0]));
    return;
  }
  if (Array.isArray(value)) for (const v of value) addNumbersFrom(v, into);
  else if (value && typeof value === "object") for (const v of Object.values(value)) addNumbersFrom(v, into);
}

export function buildFacts(input: SummaryInput): Facts {
  const json: Record<string, unknown> = {
    address: input.address,
    period: { from: input.window.start, to: input.window.end, months: 36 },
  };
  const loaded = new Set<SummarySection>();

  if (input.ranking) {
    loaded.add("ranking");
    json.ranking = input.ranking.ranked
      ? {
          rankAmongNeighbors: input.ranking.rank,
          buildingsInNeighborhood: input.ranking.buildingsInNeighborhood,
          neighborhood: input.ranking.neighborhood,
          moreHauntedThanPercentOfNeighbors: input.ranking.moreHauntedThanPercent,
          score: input.ranking.score,
          neighborhoodMedianScore: input.ranking.neighborhoodMedianScore,
          scoreMeans: "HPD violations in the period, weighted 3 for class C, 2 for B, 1 for A, divided by apartments. Rank 1 is the most haunted.",
        }
      : { notRanked: input.ranking.reason };
  }

  if (input.pluto !== undefined) {
    loaded.add("pluto");
    json.pluto =
      input.pluto === null
        ? { noRecord: true }
        : {
            yearBuilt: input.pluto.yearBuilt,
            floors: input.pluto.floors,
            apartments: input.pluto.unitsRes,
            buildingType: input.pluto.buildingClassLabel,
          };
  }

  if (input.violations) {
    loaded.add("violations");
    const v = input.violations;
    // No total: it mixes hazardous and non-hazardous classes (and class I information orders),
    // and the first test summaries called it "hazardous". The number check drops any total the model adds up.
    json.violations = {
      openRightNow: {
        classC_immediatelyHazardous: v.open.c,
        classB_hazardous: v.open.b,
        classA_nonHazardous: v.open.a,
        ...(v.open.other > 0 ? { classI_informationOnly: v.open.other } : {}),
      },
      mostRecentOpen: v.recent.slice(0, MAX_RECENT_VIOLATIONS).map((r) => ({
        class: r.class,
        inspected: r.inspectedOn,
        // HPD writes each violation as an order to the landlord ("Repair the ..."), not as a description.
        inspectorOrderedTheLandlordTo: stripUnitReferences(r.text).replace(/^\w/, (c) => c.toLowerCase()),
      })),
    };
  }

  if (input.complaints) {
    loaded.add("complaints");
    json.complaints = {
      openRightNow: input.complaints.open,
      inPeriodByProblem: Object.fromEntries(input.complaints.byCategory.map((c) => [c.label, c.count])),
      note: "One complaint can list several problems, so the problem counts don't add up to a total.",
    };
  }

  if (input.service_requests) {
    loaded.add("service_requests");
    json.service_requests = { inPeriodMostCommon: Object.fromEntries(input.service_requests.top.map((t) => [t.label, t.count])) };
  }

  if (input.evictions) {
    loaded.add("evictions");
    json.evictions = {
      residentialInPeriod: input.evictions.inWindow,
      residentialOnRecordTotal: input.evictions.total,
      mostRecent: input.evictions.mostRecent,
    };
  }

  if (input.permits) {
    loaded.add("permits");
    const latest = input.permits.recent[0];
    json.permits = {
      onRecordTotal: input.permits.total,
      mostRecent: latest ? { date: latest.date, type: latest.label } : null,
    };
  }

  const numbers = new Set<number>();
  addNumbersFrom(json, numbers);
  return { json, numbers, loaded };
}
