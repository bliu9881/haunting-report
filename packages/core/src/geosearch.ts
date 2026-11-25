import { fetchJson } from "./http";
import { boroughCode, normalizeBbl, normalizeBin } from "./identifiers";
import { isBlankStreet, streetMatches } from "./street";
import type { BuildingId, SourceError } from "./types";

export const GEOSEARCH_URL = "https://geosearch.planninglabs.nyc/v2/search";
export const GEOSEARCH_TIMEOUT_MS = 5000;
const LOW_CONFIDENCE = 0.6;

export type Candidate = BuildingId & {
  label: string;
  borough: string;
  confidence: number;
  housenumber: string | null;
  street: string | null;
  postcode: string | null;
};

export type AmbiguityReason = "no_housenumber" | "multiple_boroughs" | "street_mismatch" | "low_confidence";

export type ResolveResult =
  | { kind: "match"; building: Candidate }
  | { kind: "ambiguous"; candidates: Candidate[]; reason: AmbiguityReason }
  | { kind: "not_found" }
  | SourceError<"geosearch">;

/** What the user's query said, as geosearch parsed it. `borough` is a code "1" to "5". */
export interface ParsedQuery {
  housenumber: string | null;
  street: string | null;
  borough: string | null;
  postcode: string | null;
}

export interface ResolveOptions {
  fetch: typeof fetch;
  signal?: AbortSignal;
  /** Default GEOSEARCH_TIMEOUT_MS. */
  timeoutMs?: number;
  /** Pause before the one retry. Default 250 ms; tests pass 0. */
  retryDelayMs?: number;
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function text(x: unknown): string | null {
  return typeof x === "string" && x.trim() !== "" ? x.trim() : null;
}

function normalizeHousenumber(h: string): string {
  return h.toUpperCase().replace(/\s+/g, "");
}

function normalizePostcode(p: string): string | null {
  const m = /^(\d{5})/.exec(p.trim());
  return m ? (m[1] as string) : null;
}

/** City names are not boroughs (Requirement 1.9), even if boroughCode later learns county names. */
const CITY_NAMES = new Set(["NEW YORK", "NEW YORK CITY", "NY", "NYC"]);

function queryBorough(x: unknown): string | null {
  const t = text(x);
  if (t === null) return null;
  const s = t.toUpperCase().replace(/\s+/g, " ").replace(/^THE /, "");
  return CITY_NAMES.has(s) ? null : boroughCode(s);
}

/** Extract candidates from a geosearch body. Drops features without a valid BBL and dedupes by (BBL, BIN). */
export function parseCandidates(body: unknown): Candidate[] {
  if (!isRecord(body) || !Array.isArray(body.features)) return [];
  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (const f of body.features) {
    if (!isRecord(f) || !isRecord(f.properties)) continue;
    const p = f.properties;
    const pad = isRecord(p.addendum) && isRecord(p.addendum.pad) ? p.addendum.pad : {};
    const bbl = normalizeBbl(pad.bbl);
    if (bbl === null) continue;
    const bin = normalizeBin(pad.bin);
    const key = `${bbl}|${bin ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      bbl,
      bin,
      label: text(p.label) ?? bbl,
      borough: text(p.borough) ?? "",
      confidence: typeof p.confidence === "number" ? p.confidence : 0,
      housenumber: text(p.housenumber),
      street: text(p.street),
      postcode: text(p.postalcode),
    });
  }
  return out;
}

export function parseQuery(body: unknown): ParsedQuery {
  const parsed =
    isRecord(body) && isRecord(body.geocoding) && isRecord(body.geocoding.query) && isRecord(body.geocoding.query.parsed_text)
      ? body.geocoding.query.parsed_text
      : {};
  const postcode = text(parsed.postcode);
  return {
    housenumber: text(parsed.housenumber),
    street: text(parsed.street),
    borough: queryBorough(parsed.borough) ?? queryBorough(parsed.locality),
    postcode: postcode === null ? null : normalizePostcode(postcode),
  };
}

/** Requirement 1.8 and 1.9. A candidate missing the field is kept: only a contradiction removes it. */
function agreesOnAddress(q: ParsedQuery, c: Candidate): boolean {
  if (q.housenumber !== null && c.housenumber !== null && normalizeHousenumber(q.housenumber) !== normalizeHousenumber(c.housenumber)) {
    return false;
  }
  const cBorough = boroughCode(c.borough);
  if (q.borough !== null && cBorough !== null && q.borough !== cBorough) return false;
  const cPostcode = c.postcode === null ? null : normalizePostcode(c.postcode);
  if (q.postcode !== null && cPostcode !== null && q.postcode !== cPostcode) return false;
  return true;
}

/** Pure decision: pick one building, or ask the user. Requirement 1. Never re-orders candidates. */
export function classify(query: ParsedQuery, all: Candidate[]): ResolveResult {
  let candidates = all.filter((c) => agreesOnAddress(query, c));
  if (candidates.length === 0) return { kind: "not_found" };

  if (query.street !== null && !isBlankStreet(query.street)) {
    const street = query.street;
    const sameStreet = candidates.filter((c) => c.street === null || streetMatches(street, c.street));
    if (sameStreet.length === 0) return { kind: "ambiguous", candidates, reason: "street_mismatch" };
    candidates = sameStreet;
  }

  const top = candidates[0] as Candidate;
  const hasPlace = query.borough !== null || query.postcode !== null;
  const distinctBbls = new Set(candidates.map((c) => c.bbl)).size;
  const distinctBoroughs = new Set(candidates.map((c) => c.borough.toUpperCase())).size;
  if (query.housenumber === null && distinctBbls > 1) return { kind: "ambiguous", candidates, reason: "no_housenumber" };
  if (!hasPlace && distinctBoroughs > 1) return { kind: "ambiguous", candidates, reason: "multiple_boroughs" };
  if (top.confidence < LOW_CONFIDENCE) return { kind: "ambiguous", candidates, reason: "low_confidence" };
  return { kind: "match", building: top };
}

/** Resolve free text to a building. Never throws. */
export async function resolveAddress(input: string, opts: ResolveOptions): Promise<ResolveResult> {
  const q = input.trim();
  if (q === "") return { kind: "not_found" };
  const url = `${GEOSEARCH_URL}?${new URLSearchParams({ text: q, size: "5" })}`;
  const res = await fetchJson(url, {
    fetch: opts.fetch,
    signal: opts.signal,
    timeoutMs: opts.timeoutMs ?? GEOSEARCH_TIMEOUT_MS,
    retryDelayMs: opts.retryDelayMs,
  });
  if (!res.ok) {
    const { reason, status, message } = res;
    return { kind: "error", source: "geosearch", reason, message, ...(status === undefined ? {} : { status }) };
  }
  const body = res.body;
  if (!isRecord(body) || !Array.isArray(body.features)) {
    return { kind: "error", source: "geosearch", reason: "malformed", message: "Not a feature collection" };
  }
  return classify(parseQuery(body), parseCandidates(body));
}
