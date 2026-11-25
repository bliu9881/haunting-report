import "server-only";
import type { NeighborhoodSummary, BuildingMetric } from "@haunting/core";
import { configFromEnv, createMariaStore, getRanking, type PublishedRanking, type RankingLookup, type RankingStore } from "@haunting/store";

// One pool per server process (Hostinger runs one long-lived process). Kept on globalThis so dev reloads reuse it.
const g = globalThis as { __hauntingStore?: Promise<RankingStore> };

function store(): Promise<RankingStore> {
  if (!g.__hauntingStore) {
    g.__hauntingStore = createMariaStore(configFromEnv()).catch((err) => {
      g.__hauntingStore = undefined; // don't cache a failed setup
      throw err;
    });
  }
  return g.__hauntingStore;
}

/**
 * A short, non-secret description of a database failure, safe to show publicly:
 * the driver's error code (ER_ACCESS_DENIED_ERROR, ECONNREFUSED, ...) or the names of missing variables.
 * Never the message itself, which can contain the user name and host.
 */
export function publicErrorCode(err: unknown): string {
  if (err instanceof Error && err.message.startsWith("Missing environment variables:")) return err.message;
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === "string" && /^[A-Z0-9_]{2,64}$/.test(code) ? code : "UNKNOWN";
}

/** Full detail goes to the server log only (Hostinger's runtime logs). */
function logFailure(where: string, err: unknown) {
  console.error(`[rankings] ${where} failed: ${publicErrorCode(err)}: ${err instanceof Error ? err.message : String(err)}`);
}

export async function lookupRanking(bbl: string): Promise<RankingLookup> {
  try {
    const r = await getRanking(await store(), bbl);
    if (r.kind === "error") console.error(`[rankings] getRanking(${bbl}) failed: ${r.reason}: ${r.message}`);
    return r;
  } catch (err) {
    logFailure(`lookupRanking(${bbl})`, err);
    return { kind: "error", source: "rankings", reason: "network", message: publicErrorCode(err) };
  }
}

export type NeighborhoodPage =
  | { kind: "ok"; neighborhood: NeighborhoodSummary; top: BuildingMetric[]; asOf: PublishedRanking | null }
  | { kind: "not_found" }
  | { kind: "error"; message: string };

export async function lookupNeighborhood(ntaCode: string, limit = 10): Promise<NeighborhoodPage> {
  try {
    const s = await store();
    const [neighborhood, top, asOf] = await Promise.all([s.getNeighborhood(ntaCode), s.topInNeighborhood(ntaCode, limit), s.published()]);
    if (neighborhood === null) return { kind: "not_found" };
    return { kind: "ok", neighborhood, top, asOf };
  } catch (err) {
    logFailure(`lookupNeighborhood(${ntaCode})`, err);
    return { kind: "error", message: publicErrorCode(err) };
  }
}

export type RankingsHealth =
  | { ok: true; runId: number; publishedAt: string; formulaVersion: string }
  | { ok: true; runId: null; note: "no rankings published yet" }
  | { ok: false; error: string };

export async function rankingsHealth(): Promise<RankingsHealth> {
  try {
    const meta = await (await store()).published();
    return meta === null
      ? { ok: true, runId: null, note: "no rankings published yet" }
      : { ok: true, runId: meta.runId, publishedAt: meta.publishedAt, formulaVersion: meta.formulaVersion };
  } catch (err) {
    logFailure("rankingsHealth", err);
    return { ok: false, error: publicErrorCode(err) };
  }
}
