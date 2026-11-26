import "server-only";
import {
  ADAPTERS,
  datasetAsOf,
  DOSSIER_DATASETS,
  newYorkToday,
  rankingWindow,
  runAdapter,
  type DossierBuilding,
  type DossierSource,
  type SectionResult,
} from "@haunting/core";
import { createCache, type Cache } from "./cache";

/** What the browser receives for one section. Errors carry only a reason code (no messages, hosts or keys). */
export type SectionPayload =
  | { kind: "ok"; source: DossierSource; data: unknown; rowCount: number; asOf: Record<string, string>; window: { start: string; end: string } }
  | { kind: "not_applicable"; source: DossierSource; reason: string }
  | { kind: "error"; source: DossierSource; reason: string };

const SIX_HOURS = 6 * 60 * 60 * 1000;

const g = globalThis as {
  __dossierCache?: Cache<SectionResult<DossierSource, unknown>>;
  __asOfCache?: Cache<{ kind: "ok"; data: string } | { kind: "error" }>;
};
// One cache per server process; kept on globalThis so dev reloads reuse it.
const sections = (g.__dossierCache ??= createCache({ maxEntries: 2000, ttlMs: SIX_HOURS, shouldCache: (r) => r.kind !== "error" }));
const asOfs = (g.__asOfCache ??= createCache({ maxEntries: 50, ttlMs: SIX_HOURS, shouldCache: (r) => r.kind === "ok" }));

function socrataOptions() {
  return { fetch, appToken: process.env.SOCRATA_APP_TOKEN?.trim() || undefined };
}

async function datasetDates(source: DossierSource): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  await Promise.all(
    DOSSIER_DATASETS[source].map(async (id) => {
      const r = await asOfs.get(id, async () => {
        const res = await datasetAsOf(id, source, socrataOptions());
        return res.kind === "ok" ? { kind: "ok" as const, data: res.data } : { kind: "error" as const };
      });
      if (r.kind === "ok") out[id] = r.data; // a missing date never fails the section
    }),
  );
  return out;
}

export async function loadSection(source: DossierSource, building: DossierBuilding, now = new Date()): Promise<SectionPayload> {
  const window = rankingWindow(newYorkToday(now));
  if (window === null) return { kind: "error", source, reason: "window" };
  // The window end is in the key, so cached results turn over at New York midnight with the rankings.
  const key = `${source}|${building.bbl}|${building.bin ?? ""}|${window.end}`;
  const [result, asOf] = await Promise.all([
    sections.get(key, () => runAdapter(ADAPTERS[source] as never, building, window, socrataOptions()) as Promise<SectionResult<DossierSource, unknown>>),
    datasetDates(source),
  ]);
  if (result.kind === "ok") return { kind: "ok", source, data: result.data, rowCount: result.rowCount, asOf, window };
  if (result.kind === "not_applicable") return { kind: "not_applicable", source, reason: result.reason };
  console.error(`[dossier] ${source} ${building.bbl} failed: ${result.reason}${result.status ? ` ${result.status}` : ""}: ${result.message}`);
  return { kind: "error", source, reason: result.reason };
}
