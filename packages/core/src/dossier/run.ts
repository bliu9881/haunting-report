/** Runs one source's queries and parses them (building-dossier Requirement 3.2). Never throws on I/O. */
import type { DateWindow } from "../ranking/refresh-guards";
import { socrataQuery, type Row, type SocrataOptions } from "../socrata";
import type { DossierBuilding, DossierSource, SectionResult } from "./types";

/**
 * Per query. Socrata's per-building queries took 0.3 to 11 s for the same query on 2026-11-26, so 8 s (the first
 * plan) failed sections that would have answered. Each section shows its own loading state, so waiting longer
 * costs one frame, not the page. Hostinger's 120 s request limit is far above this.
 */
export const DOSSIER_SOURCE_TIMEOUT_MS = 20_000;

export interface DossierQuery {
  dataset: string;
  params: Record<string, string>;
  /** When true, a failure passes `null` to the parser instead of failing the section. */
  optional?: boolean;
}

export interface Adapter<S extends DossierSource, T> {
  source: S;
  /** Null when the source can't be queried for this building (DOB without a BIN). */
  queries(b: DossierBuilding, w: DateWindow): DossierQuery[] | { notApplicable: string };
  /** Pure. `bodies[i]` answers `queries()[i]`, or is null when an optional query failed. */
  parse(bodies: (Row[] | null)[], b: DossierBuilding, w: DateWindow): { data: T; rowCount: number };
}

export async function runAdapter<S extends DossierSource, T>(
  adapter: Adapter<S, T>,
  b: DossierBuilding,
  w: DateWindow,
  opts: SocrataOptions,
): Promise<SectionResult<S, T>> {
  const qs = adapter.queries(b, w);
  if (!Array.isArray(qs)) return { kind: "not_applicable", source: adapter.source, reason: qs.notApplicable };
  const results = await Promise.all(
    qs.map((q) => socrataQuery(q.dataset, q.params, adapter.source, { timeoutMs: DOSSIER_SOURCE_TIMEOUT_MS, ...opts })),
  );
  const firstError = results.find((r) => r.kind === "error");
  const requiredFailed = results.some((r, i) => r.kind === "error" && !qs[i]?.optional);
  if (firstError && firstError.kind === "error" && (requiredFailed || results.every((r) => r.kind === "error"))) {
    return { ...firstError, source: adapter.source };
  }
  const bodies = results.map((r) => (r.kind === "ok" ? r.data : null));
  const { data, rowCount } = adapter.parse(bodies, b, w);
  return { kind: "ok", source: adapter.source, data, rowCount };
}
