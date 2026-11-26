/**
 * One refresh run (neighborhood-rankings Requirement 4, task 7.1). Never throws: every outcome is
 * recorded in refresh_run, and a failure leaves the previous rankings live.
 */
import {
  assembleRankings,
  datasetAsOf,
  DATASETS,
  fetchComplaintCounts,
  fetchCrosswalk,
  fetchEvictionCounts,
  fetchPluto,
  fetchViolationCounts,
  FORMULA_VERSION,
  rankingWindow,
  shrunkSources,
  type AssembleStats,
  type SocrataOptions,
  type SourceName,
} from "@haunting/core";
import type { PublishedRanking, RankingStore } from "@haunting/store";

/**
 * Absolute floors, checked on every run, including the first (when there is no previous run to compare).
 * About half of what each source returned on 2026-11-25 (docs/data-sources.md).
 */
export const MIN_ROWS: Readonly<Record<SourceName, number>> = {
  crosswalk: 2_000, // 2,327
  pluto: 150_000, // 172,630
  violations: 160_000, // ~320k grouped rows
  complaints: 50_000, // ~98k
  evictions: 10_000, // 21,455
};

/**
 * Per query. From Hostinger's shared IP without an app token, Socrata answered 2 to 4 times slower than
 * from a laptop, and one borough query passed 120 s (run 2, 2026-11-26). Five minutes per query still
 * fits several slow queries inside DEADLINE_MS.
 */
export const SOCRATA_REFRESH_TIMEOUT_MS = 300_000;
/** Below Hostinger's 30-minute cron limit, so a slow run is recorded as failed instead of killed mid-way. */
export const DEADLINE_MS = 25 * 60_000;

export interface RefreshDeps {
  store: RankingStore;
  fetch: typeof fetch;
  now?: () => Date;
  log?: (line: string) => void;
  appToken?: string;
  socrataTimeoutMs?: number;
  deadlineMs?: number;
  retryDelayMs?: number;
  minRows?: Partial<Record<SourceName, number>>;
}

export type RefreshResult =
  | { ok: true; runId: number; published: PublishedRanking; rowCounts: Record<string, number>; stats: AssembleStats; durationMs: number }
  | { ok: false; runId: number | null; error: string; rowCounts: Record<string, number>; durationMs: number };

class RefreshError extends Error {}

/** The New York civil date of an instant, `YYYY-MM-DD` (data-conventions: never via UTC). */
export function newYorkDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function runRefresh(deps: RefreshDeps): Promise<RefreshResult> {
  const now = deps.now ?? (() => new Date());
  const log = deps.log ?? ((line: string) => console.log(line));
  const started = now();
  const t0 = performance.now();
  const elapsed = () => Math.round(performance.now() - t0);
  const rowCounts: Record<string, number> = {};
  let runId: number | null = null;

  const deadline = AbortSignal.timeout(deps.deadlineMs ?? DEADLINE_MS);
  const socrata: SocrataOptions = {
    fetch: deps.fetch,
    appToken: deps.appToken || undefined,
    timeoutMs: deps.socrataTimeoutMs ?? SOCRATA_REFRESH_TIMEOUT_MS,
    retryDelayMs: deps.retryDelayMs,
    signal: deadline,
  };

  /** Runs one source and records its row count, or stops the run naming the source. */
  async function source<T>(
    name: SourceName,
    run: () => Promise<{ kind: "ok"; data: { data: T; rowCount: number; dropped: number } } | { kind: "error"; reason: string; message: string }>,
  ): Promise<T> {
    const s = performance.now();
    const res = await run();
    if (res.kind === "error") throw new RefreshError(`${name}: ${res.reason}: ${res.message}`);
    rowCounts[name] = res.data.rowCount;
    log(`  ${name.padEnd(10)} ${String(res.data.rowCount).padStart(8)} rows, ${String(res.data.dropped).padStart(6)} dropped, ${((performance.now() - s) / 1000).toFixed(1)} s`);
    return res.data.data;
  }

  try {
    const window = rankingWindow(newYorkDate(started));
    if (window === null) throw new RefreshError("Could not compute the ranking window");
    log(`Refresh ${FORMULA_VERSION}, window ${window.start} to ${window.end}`);

    await deps.store.ensureSchema();
    const previous = await deps.store.lastSuccessfulRun();
    runId = await deps.store.startRun({
      startedAt: started.toISOString(),
      formulaVersion: FORMULA_VERSION,
      windowStart: window.start,
      windowEnd: window.end,
    });
    log(`Run ${runId}${previous ? `, comparing with run ${previous.id}` : ", first run"}`);

    // Sources run one after another, to stay polite to Socrata and inside the request timeouts.
    const crosswalk = await source("crosswalk", () => fetchCrosswalk(socrata));
    const pluto = await source("pluto", () => fetchPluto(socrata));
    const violations = await source("violations", () => fetchViolationCounts(window, socrata));
    const complaints = await source("complaints", () => fetchComplaintCounts(window, socrata));
    const evictions = await source("evictions", () => fetchEvictionCounts(window, socrata));

    const sourceAsOf: Record<string, string> = {};
    for (const [name, id] of Object.entries(DATASETS)) {
      const res = await datasetAsOf(id, name, socrata);
      if (res.kind === "error") throw new RefreshError(`${name} as-of date: ${res.reason}: ${res.message}`);
      sourceAsOf[name] = res.data;
    }

    // Guards (Requirement 4.3): absolute floors, then the shrink check against the last good run.
    const floors = { ...MIN_ROWS, ...deps.minRows };
    const thin = Object.entries(floors).filter(([name, min]) => (rowCounts[name] ?? 0) < min);
    if (thin.length > 0) {
      throw new RefreshError(`Too few rows: ${thin.map(([n, min]) => `${n} ${rowCounts[n] ?? 0} < ${min}`).join(", ")}`);
    }
    const shrunk = shrunkSources(rowCounts, previous?.rowCounts ?? null);
    if (shrunk.length > 0) {
      throw new RefreshError(
        `Sources shrank below 80% of run ${previous?.id}: ${shrunk.map((n) => `${n} ${rowCounts[n] ?? 0} vs ${previous?.rowCounts[n]}`).join(", ")}`,
      );
    }

    const a = performance.now();
    const { buildings, neighborhoods, stats } = assembleRankings({ pluto, crosswalk, violations, complaints, evictions });
    log(`Assembled ${buildings.length} buildings, ${neighborhoods.length} neighborhoods in ${Math.round(performance.now() - a)} ms`);
    log(`  status: ${Object.entries(stats.byStatus).map(([k, v]) => `${k} ${v}`).join(", ")}`);
    log(`  unmatched: violations ${stats.unmatched.violations}, complaints ${stats.unmatched.complaints}, evictions ${stats.unmatched.evictions}`);

    const p = performance.now();
    const published = await deps.store.publish(
      { buildings, neighborhoods },
      { runId, formulaVersion: FORMULA_VERSION, windowStart: window.start, windowEnd: window.end, sourceAsOf },
    );
    log(`Published in ${((performance.now() - p) / 1000).toFixed(1)} s`);

    await deps.store.finishRun(runId, { finishedAt: now().toISOString(), status: "succeeded", sourceAsOf, rowCounts, error: null });
    log(`Run ${runId} succeeded in ${(elapsed() / 1000).toFixed(1)} s`);
    return { ok: true, runId, published, rowCounts, stats, durationMs: elapsed() };
  } catch (err) {
    const error = deadline.aborted ? `Deadline of ${deps.deadlineMs ?? DEADLINE_MS} ms passed: ${describeError(err)}` : describeError(err);
    log(`Run ${runId ?? "(not started)"} FAILED: ${error}. The previous rankings stay live.`);
    if (runId !== null) {
      await deps.store
        .finishRun(runId, { finishedAt: now().toISOString(), status: "failed", sourceAsOf: {}, rowCounts, error: error.slice(0, 2000) })
        .catch((e) => log(`Could not record the failure: ${describeError(e)}`));
    }
    return { ok: false, runId, error, rowCounts, durationMs: elapsed() };
  }
}
