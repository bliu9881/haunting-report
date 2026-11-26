import { normalizeBbl } from "@haunting/core";
import { lookupRanking } from "@/lib/rankings";

export const dynamic = "force-dynamic";

/** A building's neighborhood ranking as JSON (mcp-server Requirement 3.1). */
export async function GET(_req: Request, { params }: { params: Promise<{ bbl: string }> }) {
  const bbl = normalizeBbl((await params).bbl);
  if (bbl === null) return Response.json({ kind: "bad_request" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  const r = await lookupRanking(bbl);
  if (r.kind === "error") {
    return Response.json({ kind: "error", source: "rankings", reason: r.reason }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  return Response.json(r, { headers: { "Cache-Control": "public, max-age=300" } });
}
