import { rankingsHealth } from "@/lib/rankings";

export const dynamic = "force-dynamic";

/** Liveness and database check. Shows only non-secret error codes (see publicErrorCode). */
export async function GET() {
  const rankings = await rankingsHealth();
  return Response.json(
    { status: rankings.ok ? "ok" : "degraded", rankings },
    { status: rankings.ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
