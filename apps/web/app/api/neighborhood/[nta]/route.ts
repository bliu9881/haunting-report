import { lookupNeighborhood } from "@/lib/rankings";

export const dynamic = "force-dynamic";

const NTA_CODE = /^[A-Z]{2}\d{4}$/;

/** A neighborhood's summary and most haunted buildings as JSON (mcp-server Requirement 3.2). */
export async function GET(req: Request, { params }: { params: Promise<{ nta: string }> }) {
  const code = decodeURIComponent((await params).nta).toUpperCase();
  const rawLimit = new URL(req.url).searchParams.get("limit");
  const limit = rawLimit === null ? 10 : Number(rawLimit);
  if (!NTA_CODE.test(code) || !Number.isInteger(limit) || limit < 1 || limit > 50) {
    return Response.json({ kind: "bad_request" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  const page = await lookupNeighborhood(code, limit);
  if (page.kind === "not_found") return Response.json(page, { status: 404, headers: { "Cache-Control": "no-store" } });
  if (page.kind === "error") return Response.json({ kind: "error", source: "rankings" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  return Response.json(page, { headers: { "Cache-Control": "public, max-age=300" } });
}
