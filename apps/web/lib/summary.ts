import "server-only";
import {
  buildFacts,
  callGemini,
  checkSummary,
  DEFAULT_GEMINI_MODEL,
  type BuildingFacts,
  type CheckedSentence,
  type Complaints,
  type DossierBuilding,
  type DossierSource,
  type Evictions,
  type Permits,
  type ServiceRequests,
  type SummaryInput,
  type Violations,
} from "@haunting/core";
import { createCache, type Cache } from "./cache";
import { loadSection } from "./dossier";
import { createRateLimiter, type RateLimiter } from "./rate-limit";
import { lookupRanking } from "./rankings";

/** What the browser receives. Reasons are codes only; details go to the server log. */
export type SummaryPayload =
  | { kind: "ok"; sentences: CheckedSentence[]; model: string }
  | { kind: "unavailable"; reason: "not_configured" | "records_incomplete" | "busy" | "model_error" | "check_failed" };

const SIX_HOURS = 6 * 60 * 60 * 1000;
const g = globalThis as { __summaryCache?: Cache<SummaryPayload>; __summaryLimiter?: RateLimiter };
const cache = (g.__summaryCache ??= createCache<SummaryPayload>({ maxEntries: 2000, ttlMs: SIX_HOURS, shouldCache: (p) => p.kind === "ok" }));
const limiter = (g.__summaryLimiter ??= createRateLimiter({ perMinute: 20, perDay: 500 }));

/** Plain reasons for the model, matching the page's own "not ranked" messages. */
const NOT_RANKED: Record<string, string> = {
  no_rankings_yet: "rankings haven't been built yet",
  not_in_rankings: "rankings only cover residential buildings with 3 or more apartments, and this building isn't one",
  small_neighborhood: "its neighborhood has too few comparable buildings to rank fairly",
  non_residential_nta: "it is in a mostly non-residential area",
  no_tract: "city records don't place it in a census tract",
  unknown_tract: "its census tract couldn't be matched to a neighborhood",
};

const SECTIONS: DossierSource[] = ["pluto", "violations", "complaints", "service_requests", "evictions", "permits"];

export async function loadSummary(building: DossierBuilding, address: string): Promise<SummaryPayload> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return { kind: "unavailable", reason: "not_configured" };
  const model = process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;

  // The same cached loads the report's sections use, so this adds no Socrata calls (and shares in-flight ones).
  const [ranking, ...sections] = await Promise.all([lookupRanking(building.bbl), ...SECTIONS.map((s) => loadSection(s, building))]);
  const bySource = Object.fromEntries(SECTIONS.map((s, i) => [s, sections[i]]));
  const ok = (s: DossierSource) => (bySource[s]?.kind === "ok" ? bySource[s].data : undefined);
  // Both HPD sections are required: without them a summary could read as "nothing wrong".
  if (ok("violations") === undefined || ok("complaints") === undefined) return { kind: "unavailable", reason: "records_incomplete" };
  const window = bySource.violations?.kind === "ok" ? bySource.violations.window : null;
  if (window === null) return { kind: "unavailable", reason: "records_incomplete" };

  const key = `summary|${building.bbl}|${building.bin ?? ""}|${window.end}|${model}`;
  return cache.get(key, async () => {
    const input: SummaryInput = {
      address,
      window,
      pluto: ok("pluto") as BuildingFacts | null | undefined,
      violations: ok("violations") as Violations,
      complaints: ok("complaints") as Complaints,
      service_requests: ok("service_requests") as ServiceRequests | undefined,
      evictions: ok("evictions") as Evictions | undefined,
      permits: ok("permits") as Permits | undefined,
    };
    if (ranking.kind === "ranked") {
      input.ranking = {
        ranked: true,
        rank: ranking.building.rank,
        buildingsInNeighborhood: ranking.building.neighborhoodCount,
        neighborhood: ranking.building.ntaName,
        moreHauntedThanPercent: Math.floor(ranking.building.moreHauntedThan * 100),
        score: Math.round(ranking.building.score * 100) / 100,
        neighborhoodMedianScore: ranking.neighborhoodMedian === null ? null : Math.round(ranking.neighborhoodMedian * 100) / 100,
      };
    } else if (ranking.kind === "not_rankable") {
      input.ranking = { ranked: false, reason: NOT_RANKED[ranking.reason] ?? "not ranked" };
    }
    const facts = buildFacts(input);

    if (!limiter.tryAcquire()) return { kind: "unavailable", reason: "busy" } as const;
    const res = await callGemini(facts, { apiKey, model, fetch });
    if (res.kind === "error") {
      console.error(`[summary] ${building.bbl} ${model} failed: ${res.reason}${res.status ? ` ${res.status}` : ""}: ${res.message}`);
      return { kind: "unavailable", reason: "model_error" } as const;
    }
    const checked = checkSummary(res.raw, facts);
    for (const d of checked.dropped) console.warn(`[summary] ${building.bbl} dropped (${d.reason}${d.detail ? ` ${d.detail}` : ""}): ${d.text}`);
    if (!checked.usable) return { kind: "unavailable", reason: "check_failed" } as const;
    return { kind: "ok", sentences: checked.sentences, model } as const;
  });
}
