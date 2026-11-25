/** NYC Open Data (Socrata) client. Neighborhood-rankings tasks 3.1 to 3.3. Never throws on I/O. */
import { fetchJson } from "./http";
import type { SourceError } from "./types";

export const SOCRATA_BASE = "https://data.cityofnewyork.us";
export const SOCRATA_TIMEOUT_MS = 15_000;
export const PAGE_SIZE = 50_000;
const MAX_PAGES = 100;

export type Row = Record<string, unknown>;

export interface SocrataOptions {
  fetch: typeof fetch;
  appToken?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  retryDelayMs?: number;
}

export type SocrataResult<T> = { kind: "ok"; data: T } | SourceError<string>;

const DATASET_ID = /^[a-z0-9]{4}-[a-z0-9]{4}$/;

function assertDatasetId(id: string): void {
  // Ids are interpolated into the URL path, so only the Socrata "four-four" form is allowed.
  if (!DATASET_ID.test(id)) throw new TypeError(`Invalid Socrata dataset id: ${id}`);
}

/** A SoQL string literal, with single quotes doubled. Use for every value placed in a $where. */
export function soqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

async function getJson(url: string, source: string, opts: SocrataOptions): Promise<SocrataResult<unknown>> {
  const res = await fetchJson(url, {
    fetch: opts.fetch,
    signal: opts.signal,
    timeoutMs: opts.timeoutMs ?? SOCRATA_TIMEOUT_MS,
    retryDelayMs: opts.retryDelayMs,
    headers: opts.appToken ? { "X-App-Token": opts.appToken } : undefined,
  });
  if (!res.ok) {
    const { reason, status, message } = res;
    return { kind: "error", source, reason, message, ...(status === undefined ? {} : { status }) };
  }
  return { kind: "ok", data: res.body };
}

/** One SoQL query. `source` names the report section or refresh source that failed. */
export async function socrataQuery(
  datasetId: string,
  params: Record<string, string>,
  source: string,
  opts: SocrataOptions,
): Promise<SocrataResult<Row[]>> {
  assertDatasetId(datasetId);
  const url = `${SOCRATA_BASE}/resource/${datasetId}.json?${new URLSearchParams(params)}`;
  const res = await getJson(url, source, opts);
  if (res.kind === "error") return res;
  if (!Array.isArray(res.data) || !res.data.every((r) => typeof r === "object" && r !== null && !Array.isArray(r))) {
    return { kind: "error", source, reason: "malformed", message: "Expected an array of rows" };
  }
  return { kind: "ok", data: res.data as Row[] };
}

/**
 * A query whose whole result must arrive in one response, such as a `$group` aggregation.
 * Paging an aggregation re-runs it per page, so instead the limit is set high and a full page is an error.
 */
export async function socrataQueryAll(
  datasetId: string,
  params: Record<string, string>,
  source: string,
  opts: SocrataOptions & { limit?: number },
): Promise<SocrataResult<Row[]>> {
  const limit = opts.limit ?? 1_000_000;
  const res = await socrataQuery(datasetId, { ...params, $limit: String(limit) }, source, opts);
  if (res.kind === "ok" && res.data.length >= limit) {
    return { kind: "error", source, reason: "malformed", message: `Result reached the ${limit}-row limit and may be truncated` };
  }
  return res;
}

/** Row pull in pages of 50k. Requires `$order`, because offset paging without one can skip or repeat rows. */
export async function socrataPages(
  datasetId: string,
  params: Record<string, string>,
  source: string,
  opts: SocrataOptions & { pageSize?: number },
): Promise<SocrataResult<Row[]>> {
  if (!params.$order) throw new TypeError("socrataPages needs $order for stable paging");
  const pageSize = opts.pageSize ?? PAGE_SIZE;
  const rows: Row[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await socrataQuery(
      datasetId,
      { ...params, $limit: String(pageSize), $offset: String(page * pageSize) },
      source,
      opts,
    );
    if (res.kind === "error") return res;
    rows.push(...res.data);
    if (res.data.length < pageSize) return { kind: "ok", data: rows };
  }
  return { kind: "error", source, reason: "malformed", message: `More than ${MAX_PAGES} pages` };
}

/** When the dataset's rows last changed, as an ISO instant (Socrata `rowsUpdatedAt`, epoch seconds). */
export async function datasetAsOf(datasetId: string, source: string, opts: SocrataOptions): Promise<SocrataResult<string>> {
  assertDatasetId(datasetId);
  const res = await getJson(`${SOCRATA_BASE}/api/views/${datasetId}.json`, source, opts);
  if (res.kind === "error") return res;
  const body = res.data;
  const secs = typeof body === "object" && body !== null ? (body as Record<string, unknown>).rowsUpdatedAt : undefined;
  if (typeof secs !== "number" || !Number.isFinite(secs) || secs <= 0) {
    return { kind: "error", source, reason: "malformed", message: "Missing rowsUpdatedAt" };
  }
  return { kind: "ok", data: new Date(secs * 1000).toISOString() };
}
