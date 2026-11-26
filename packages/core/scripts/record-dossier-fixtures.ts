// Records the live responses to every dossier query for buildings A and B, as test fixtures.
// Run from packages/core: npm run record:dossier   (reads SOCRATA_APP_TOKEN from the repo .env)
import { writeFileSync } from "node:fs";
import path from "node:path";
import { ADAPTERS, DOSSIER_SOURCES } from "../src/dossier";
import type { DossierBuilding } from "../src/dossier";

const WINDOW = { start: "2023-11-25", end: "2026-11-25" };
const BUILDINGS: Record<string, DossierBuilding> = {
  "building-a": { bbl: "3013610043", bin: "3036097" }, // 48-unit walk-up, many violations
  "building-b": { bbl: "1015500031", bin: "1050055" }, // commercial, no housing records
};

const headers: Record<string, string> = process.env.SOCRATA_APP_TOKEN ? { "X-App-Token": process.env.SOCRATA_APP_TOKEN } : {};

async function get(dataset: string, params: Record<string, string>): Promise<{ status: number; body: unknown }> {
  const url = `https://data.cityofnewyork.us/resource/${dataset}.json?${new URLSearchParams(params)}`;
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(60_000) });
      if (res.status >= 500 && attempt < 4) continue; // Socrata's intermittent 503s
      return { status: res.status, body: await res.json() };
    } catch (err) {
      if (attempt >= 4) throw err;
    }
  }
}

for (const [name, building] of Object.entries(BUILDINGS)) {
  for (const source of DOSSIER_SOURCES) {
    const qs = ADAPTERS[source].queries(building, WINDOW);
    if (!Array.isArray(qs)) continue;
    const recorded = [];
    for (const q of qs) recorded.push({ dataset: q.dataset, params: q.params, ...(await get(q.dataset, q.params)) });
    // The bundle runs from /tmp, so paths are relative to the package folder (npm runs scripts there).
    const file = path.join(process.cwd(), "test", "fixtures", `dossier-${source}-${name}.json`);
    writeFileSync(file, JSON.stringify({ building, window: WINDOW, queries: recorded }, null, 1) + "\n");
    console.log(`${name.padEnd(11)} ${source.padEnd(17)} ${recorded.map((r) => `${r.status}:${Array.isArray(r.body) ? r.body.length : "?"}`).join(" ")}`);
  }
}
