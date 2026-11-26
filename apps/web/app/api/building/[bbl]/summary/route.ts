import { normalizeBbl, normalizeBin } from "@haunting/core";
import { loadSummary } from "@/lib/summary";

export const dynamic = "force-dynamic";

/** The medium's reading for one building (ai-summary design). */
export async function GET(req: Request, { params }: { params: Promise<{ bbl: string }> }) {
  const { bbl: rawBbl } = await params;
  const url = new URL(req.url);
  const bbl = normalizeBbl(rawBbl);
  const rawBin = url.searchParams.get("bin");
  const bin = rawBin === null || rawBin === "" ? null : normalizeBin(rawBin);
  if (bbl === null || (rawBin && bin === null)) {
    return Response.json({ kind: "bad_request" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  const address = (url.searchParams.get("address") ?? "").slice(0, 200).trim() || `Building ${bbl}`;
  const payload = await loadSummary({ bbl, bin }, address);
  return Response.json(payload, { headers: { "Cache-Control": payload.kind === "ok" ? "public, max-age=300" : "no-store" } });
}
