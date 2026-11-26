import { isDossierSource, normalizeBbl, normalizeBin } from "@haunting/core";
import { loadSection } from "@/lib/dossier";

export const dynamic = "force-dynamic";

/** One report section as JSON (building-dossier design, "Route handler"). */
export async function GET(req: Request, { params }: { params: Promise<{ bbl: string; section: string }> }) {
  const { bbl: rawBbl, section } = await params;
  const bbl = normalizeBbl(rawBbl);
  const rawBin = new URL(req.url).searchParams.get("bin");
  const bin = rawBin === null || rawBin === "" ? null : normalizeBin(rawBin);
  if (bbl === null || !isDossierSource(section) || (rawBin && bin === null)) {
    return Response.json({ kind: "bad_request" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  const payload = await loadSection(section, { bbl, bin });
  const ok = payload.kind !== "error";
  return Response.json(payload, {
    status: ok ? 200 : 503,
    headers: { "Cache-Control": ok ? "public, max-age=300" : "no-store" },
  });
}
