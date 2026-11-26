/**
 * Tool logic for the Haunting Report MCP server (mcp-server Requirements 1 and 2).
 * Reads the live site's public JSON API; address lookup uses NYC Geosearch directly. Never throws on I/O.
 */
import { DOSSIER_SOURCES, fetchJson, normalizeBbl, normalizeBin, resolveAddress } from "@haunting/core";

export const DEFAULT_BASE_URL = "https://perky-mediumvioletred-giraffe-73.hostingersite.com";
/** Above the site's own 20 s per-section limit, so a slow section comes back as the site's answer, not a timeout here. */
export const SITE_TIMEOUT_MS = 45_000;
const NTA_CODE = /^[A-Z]{2}\d{4}$/;

export interface ToolDeps {
  fetch: typeof fetch;
  baseUrl: string;
}

/** What a tool returns: the result, and whether the call failed as a whole. */
export interface ToolOutput {
  result: Record<string, unknown>;
  isError: boolean;
}

const invalid = (message: string): ToolOutput => ({ result: { kind: "invalid_input", message }, isError: true });

async function getJson(deps: ToolDeps, path: string): Promise<{ ok: true; body: unknown } | { ok: false; reason: string }> {
  // No retry here: the site already retries its upstreams, and a retried 503 would double the wait.
  const r = await fetchJson(`${deps.baseUrl}${path}`, { fetch: deps.fetch, timeoutMs: SITE_TIMEOUT_MS, retries: 0 });
  if (r.ok) return { ok: true, body: r.body };
  return { ok: false, reason: r.status ? `${r.reason} ${r.status}` : r.reason };
}

export async function findBuilding(deps: ToolDeps, args: { address: string }): Promise<ToolOutput> {
  const address = args.address.trim();
  if (address === "" || address.length > 200) return invalid("address must be 1 to 200 characters");
  const r = await resolveAddress(address, { fetch: deps.fetch });
  switch (r.kind) {
    case "match":
      return {
        result: { kind: "match", building: { bbl: r.building.bbl, bin: r.building.bin, label: r.building.label, borough: r.building.borough } },
        isError: false,
      };
    case "ambiguous":
      return {
        result: {
          kind: "ambiguous",
          reason: r.reason,
          candidates: r.candidates.map((c) => ({ bbl: c.bbl, bin: c.bin, label: c.label, borough: c.borough })),
        },
        isError: false,
      };
    case "not_found":
      return { result: { kind: "not_found" }, isError: false };
    case "error":
      return { result: { kind: "error", source: "geosearch", reason: r.reason }, isError: true };
  }
}

export async function buildingReport(
  deps: ToolDeps,
  args: { bbl: string; bin?: string; include_summary?: boolean },
): Promise<ToolOutput> {
  const bbl = normalizeBbl(args.bbl);
  if (bbl === null) return invalid("bbl must be a 10-digit borough-block-lot number, e.g. 3013610043");
  const bin = args.bin === undefined || args.bin === "" ? null : normalizeBin(args.bin);
  if (args.bin && bin === null) return invalid("bin must be a 7-digit building number starting with 1 to 5");
  const q = bin ? `?bin=${bin}` : "";

  const [ranking, summary, ...sections] = await Promise.all([
    getJson(deps, `/api/building/${bbl}/ranking`),
    args.include_summary ? getJson(deps, `/api/building/${bbl}/summary${q}`) : Promise.resolve(null),
    ...DOSSIER_SOURCES.map((s) => getJson(deps, `/api/building/${bbl}/${s}${q}`)),
  ]);
  const unavailable = (reason: string) => ({ kind: "unavailable", reason });
  const result: Record<string, unknown> = {
    bbl,
    bin,
    reportUrl: `${deps.baseUrl}/building/${bbl}${q}`,
    ranking: ranking.ok ? ranking.body : unavailable(ranking.reason),
    sections: Object.fromEntries(DOSSIER_SOURCES.map((s, i) => [s, sections[i]?.ok ? sections[i].body : unavailable(sections[i]?.reason ?? "unknown")])),
  };
  if (summary !== null) result.summary = summary.ok ? summary.body : unavailable(summary.reason);
  // The call failed as a whole only if nothing at all came back (Requirement 2.2).
  const anything = ranking.ok || sections.some((s) => s?.ok);
  return { result, isError: !anything };
}

export async function neighborhoodMostHaunted(deps: ToolDeps, args: { nta_code: string; limit?: number }): Promise<ToolOutput> {
  const code = args.nta_code.trim().toUpperCase();
  if (!NTA_CODE.test(code)) return invalid("nta_code must look like BK0802 (two letters, four digits)");
  const limit = args.limit ?? 10;
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) return invalid("limit must be an integer from 1 to 50");
  const r = await getJson(deps, `/api/neighborhood/${code}?limit=${limit}`);
  if (!r.ok) {
    return r.reason === "http 404"
      ? { result: { kind: "not_found", nta_code: code }, isError: false }
      : { result: { kind: "unavailable", reason: r.reason }, isError: true };
  }
  return { result: { ...(r.body as Record<string, unknown>), pageUrl: `${deps.baseUrl}/neighborhood/${code}` }, isError: false };
}

export async function rankingsStatus(deps: ToolDeps): Promise<ToolOutput> {
  const r = await getJson(deps, "/api/health");
  return r.ok ? { result: r.body as Record<string, unknown>, isError: false } : { result: { status: "unreachable", reason: r.reason }, isError: true };
}
