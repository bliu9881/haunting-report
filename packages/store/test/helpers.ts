import { assembleRankings, type NtaInfo, type PlutoBuilding, type ViolationCounts } from "@haunting/core";
import type { RankingSnapshot } from "../src";

/**
 * A realistic snapshot built with the real assembler: `n` buildings over 3 residential neighborhoods,
 * one non-residential tract, and a few buildings with no tract. `seed` varies the violation counts.
 */
export function makeSnapshot(n = 90, seed = 0): RankingSnapshot {
  const crosswalk = new Map<string, NtaInfo>([
    ["3034700", { ntaCode: "BK0802", ntaName: "Crown Heights (North)", ntaType: "0" }],
    ["1014602", { ntaCode: "MN0802", ntaName: "Upper East Side-Yorkville", ntaType: "0" }],
    ["2001901", { ntaCode: "BX0101", ntaName: "Mott Haven-Port Morris", ntaType: "0" }],
    ["4071600", { ntaCode: "QN8381", ntaName: "John F. Kennedy International Airport", ntaType: "8" }],
  ]);
  const tracts = ["3034700", "1014602", "2001901", "4071600", null] as const;
  const pluto = new Map<string, PlutoBuilding>();
  const violations = new Map<string, ViolationCounts>();
  const complaints = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    const tract = tracts[i % tracts.length] ?? null;
    const boro = tract ? tract[0] : "3";
    const bbl = `${boro}${String(10_000 + i).padStart(5, "0")}${String(i % 9999).padStart(4, "0")}`;
    pluto.set(bbl, { bbl, address: `${100 + i} TEST AVENUE`, unitsRes: 3 + ((i * 7) % 60), tract });
    const k = (i * 31 + seed * 17) % 11;
    if (k > 2) violations.set(bbl, { a: k, b: (k * 3) % 7, c: (k + seed) % 5 });
    if (k % 2 === 0) complaints.set(bbl, k + seed);
  }
  // 1/3-style scores make exact double round-trips matter.
  const { buildings, neighborhoods } = assembleRankings({ pluto, crosswalk, violations, complaints, evictions: new Map() }, 10);
  return { buildings, neighborhoods };
}

export const META = {
  runId: 1,
  formulaVersion: "v1:test",
  windowStart: "2023-11-25",
  windowEnd: "2026-11-25",
  sourceAsOf: { pluto: "2026-11-20T04:00:00.000Z", violations: "2026-11-25T09:12:48.000Z" },
};
