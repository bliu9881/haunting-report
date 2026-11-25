import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  addCountRows,
  addViolationRows,
  assembleRankings,
  median,
  MIN_NEIGHBORHOOD_SIZE,
  parseCrosswalk,
  parsePluto,
  score,
  type AssembleInput,
  type NtaInfo,
  type PlutoBuilding,
  type ViolationCounts,
} from "../src/ranking";

const fixture = (name: string): Record<string, unknown>[] =>
  JSON.parse(readFileSync(new URL(`./fixtures/socrata-${name}.json`, import.meta.url), "utf8"));

const BUILDING_A = "3013610043";

function emptyInput(): AssembleInput {
  return { pluto: new Map(), crosswalk: new Map(), violations: new Map(), complaints: new Map(), evictions: new Map() };
}

describe("assembleRankings with recorded responses", () => {
  const violations = new Map<string, ViolationCounts>();
  addViolationRows(violations, fixture("violations-brooklyn"));
  const complaints = new Map<string, number>();
  addCountRows(complaints, fixture("complaints-brooklyn"));
  const input: AssembleInput = {
    pluto: parsePluto(fixture("pluto")).data,
    crosswalk: parseCrosswalk(fixture("crosswalk")).data,
    violations,
    complaints,
    evictions: new Map(),
  };

  it("scores building A from its real counts: (3×77 + 2×102 + 21) / 48 units = 9.5", () => {
    const a = assembleRankings(input, 1).buildings.find((b) => b.bbl === BUILDING_A);
    expect(a).toMatchObject({
      address: "1248 ST MARKS AVENUE",
      unitsRes: 48,
      ntaCode: "BK0802",
      ntaName: "Crown Heights (North)",
      violations: { a: 21, b: 102, c: 77 },
      complaints: 64,
      evictions: 0,
      score: 9.5,
      status: "ranked",
      rank: 1,
      neighborhoodCount: 1,
    });
  });

  it("marks building A's one-building neighborhood as too small at the real threshold", () => {
    const a = assembleRankings(input).buildings.find((b) => b.bbl === BUILDING_A);
    expect(a).toMatchObject({ status: "small_neighborhood", rank: null, neighborhoodCount: 1, moreHauntedThan: null });
  });

  it("gives a PLUTO building with no tract the no_tract status", () => {
    expect(assembleRankings(input).buildings.find((b) => b.bbl === "1005720026")).toMatchObject({ status: "no_tract", ntaCode: null });
  });

  it("reports counts that matched no PLUTO building", () => {
    const { unmatched } = assembleRankings(input).stats;
    const expected = [...violations].filter(([b]) => b !== BUILDING_A).reduce((s, [, c]) => s + c.a + c.b + c.c, 0);
    expect(unmatched.violations).toBe(expected);
    expect(unmatched.complaints).toBe([...complaints].filter(([b]) => b !== BUILDING_A).reduce((s, [, n]) => s + n, 0));
  });
});

describe("assembleRankings examples", () => {
  it("gives a building with no records a score of 0 and zero counts, not a missing row (task 5)", () => {
    const input = emptyInput();
    input.pluto = new Map([["1000010001", { bbl: "1000010001", address: "1 X ST", unitsRes: 10, tract: "1000100" }]]);
    input.crosswalk = new Map([["1000100", { ntaCode: "MN0101", ntaName: "Somewhere", ntaType: "0" }]]);
    const [b] = assembleRankings(input, 1).buildings;
    expect(b).toMatchObject({ score: 0, violations: { a: 0, b: 0, c: 0 }, complaints: 0, evictions: 0, rank: 1 });
  });

  it("does not rank buildings in non-residential or unknown neighborhoods", () => {
    const input = emptyInput();
    input.pluto = new Map([
      ["4000010001", { bbl: "4000010001", address: "JFK", unitsRes: 5, tract: "4071600" }],
      ["4000010002", { bbl: "4000010002", address: "NOWHERE", unitsRes: 5, tract: "4999999" }],
    ]);
    input.crosswalk = new Map([["4071600", { ntaCode: "QN8381", ntaName: "JFK Airport", ntaType: "8" }]]);
    const r = assembleRankings(input, 1);
    expect(r.buildings.map((b) => b.status)).toEqual(["non_residential_nta", "unknown_tract"]);
    expect(r.neighborhoods).toEqual([]);
  });

  it("summarizes a neighborhood with its count and median", () => {
    const input = emptyInput();
    const units = [10, 10, 10, 10];
    const pluto = new Map<string, PlutoBuilding>();
    const violations = new Map<string, ViolationCounts>();
    units.forEach((u, i) => {
      const bbl = `300001000${i + 1}`;
      pluto.set(bbl, { bbl, address: `${i} A ST`, unitsRes: u, tract: "3034700" });
      violations.set(bbl, { a: i * 10, b: 0, c: 0 }); // scores 0, 1, 2, 3
    });
    input.pluto = pluto;
    input.violations = violations;
    input.crosswalk = new Map([["3034700", { ntaCode: "BK0802", ntaName: "Crown Heights (North)", ntaType: "0" }]]);
    expect(assembleRankings(input, 1).neighborhoods).toEqual([
      { ntaCode: "BK0802", ntaName: "Crown Heights (North)", borough: "3", count: 4, medianScore: 1.5, ranked: true },
    ]);
    expect(assembleRankings(input).neighborhoods[0]?.ranked).toBe(false);
  });
});

describe("median", () => {
  it("handles odd, even and empty inputs", () => {
    expect(median([1, 2, 9])).toBe(2);
    expect(median([1, 2, 3, 9])).toBe(2.5);
    expect(median([])).toBe(0);
  });
});

// ---------- properties ----------

const TRACTS = ["1000100", "2001901", "3034700", "3034800", "4071600"] as const;
const CROSSWALK = new Map<string, NtaInfo>([
  ["1000100", { ntaCode: "MN0101", ntaName: "MN one", ntaType: "0" }],
  ["2001901", { ntaCode: "BX0101", ntaName: "BX one", ntaType: "0" }],
  ["3034700", { ntaCode: "BK0802", ntaName: "BK two", ntaType: "0" }],
  ["3034800", { ntaCode: "BK0802", ntaName: "BK two", ntaType: "0" }],
  ["4071600", { ntaCode: "QN8381", ntaName: "Airport", ntaType: "8" }],
]);

const bbl = fc.stringMatching(/^[1-5]\d{9}$/);
const plutoArb = fc
  .uniqueArray(
    fc.record({
      bbl,
      address: fc.constant("1 TEST ST"),
      unitsRes: fc.integer({ min: 3, max: 200 }),
      tract: fc.option(fc.constantFrom(...TRACTS, "5999999"), { nil: null }),
    }),
    { selector: (b) => b.bbl, maxLength: 80 },
  )
  .map((bs) => new Map(bs.map((b) => [b.bbl, b as PlutoBuilding])));

const inputArb: fc.Arbitrary<AssembleInput> = plutoArb.chain((pluto) => {
  const bbls = [...pluto.keys()];
  // Counts for buildings in the pull, plus some for BBLs that are not in it.
  const anyBbl = bbls.length > 0 ? fc.oneof(fc.constantFrom(...bbls), bbl) : bbl;
  const counts = fc.array(fc.tuple(anyBbl, fc.nat(30)), { maxLength: 60 }).map((kv) => new Map(kv));
  const vcounts = fc
    .array(fc.tuple(anyBbl, fc.record({ a: fc.nat(30), b: fc.nat(30), c: fc.nat(30) })), { maxLength: 60 })
    .map((kv) => new Map(kv));
  return fc.record({
    pluto: fc.constant(pluto),
    crosswalk: fc.constant(CROSSWALK),
    violations: vcounts,
    complaints: counts,
    evictions: counts,
  });
});
const minSize = fc.integer({ min: 1, max: 25 });

describe("assembleRankings properties", () => {
  it("emits every PLUTO building exactly once, in BBL order", () => {
    fc.assert(
      fc.property(inputArb, minSize, (input, m) => {
        const bbls = assembleRankings(input, m).buildings.map((b) => b.bbl);
        expect(bbls).toEqual([...input.pluto.keys()].sort());
      }),
    );
  });

  it("scores every building with the scoring formula, defaulting missing counts to 0", () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        for (const b of assembleRankings(input).buildings) {
          expect(b.score).toBe(score(input.violations.get(b.bbl) ?? { a: 0, b: 0, c: 0 }, b.unitsRes));
          expect(b.complaints).toBe(input.complaints.get(b.bbl) ?? 0);
          expect(b.evictions).toBe(input.evictions.get(b.bbl) ?? 0);
        }
      }),
    );
  });

  it("ranks a building exactly when its tract is in a residential neighborhood with enough buildings", () => {
    fc.assert(
      fc.property(inputArb, minSize, (input, m) => {
        const out = assembleRankings(input, m).buildings;
        const residential = (b: PlutoBuilding) => b.tract !== null && CROSSWALK.get(b.tract)?.ntaType === "0";
        for (const r of out) {
          const p = input.pluto.get(r.bbl) as PlutoBuilding;
          const nta = p.tract === null ? undefined : CROSSWALK.get(p.tract);
          const peers = [...input.pluto.values()].filter((o) => residential(o) && CROSSWALK.get(o.tract as string)?.ntaCode === nta?.ntaCode);
          const shouldRank = residential(p) && peers.length >= m;
          expect(r.status === "ranked").toBe(shouldRank);
          expect(r.rank !== null).toBe(shouldRank);
          if (residential(p)) expect(r.neighborhoodCount).toBe(peers.length);
          else expect(r.neighborhoodCount).toBeNull();
        }
      }),
    );
  });

  it("rank is 1 plus the number of neighbors with a strictly higher score", () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const out = assembleRankings(input, 1).buildings;
        for (const r of out) {
          if (r.rank === null) continue;
          const higher = out.filter((o) => o.rank !== null && o.ntaCode === r.ntaCode && o.score > r.score).length;
          expect(r.rank).toBe(1 + higher);
        }
      }),
    );
  });

  it("status counts add up to the number of buildings, and neighborhood medians lie within their scores", () => {
    fc.assert(
      fc.property(inputArb, minSize, (input, m) => {
        const r = assembleRankings(input, m);
        expect(Object.values(r.stats.byStatus).reduce((s, n) => s + n, 0)).toBe(input.pluto.size);
        for (const n of r.neighborhoods) {
          const scores = r.buildings.filter((b) => b.ntaCode === n.ntaCode).map((b) => b.score);
          expect(n.count).toBe(scores.length);
          expect(n.medianScore).toBeGreaterThanOrEqual(Math.min(...scores));
          expect(n.medianScore).toBeLessThanOrEqual(Math.max(...scores));
          expect(n.ranked).toBe(n.count >= m);
        }
      }),
    );
  });

  it("matched plus unmatched counts equal the input totals: nothing is lost or counted twice", () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const r = assembleRankings(input);
        const total = (m: ReadonlyMap<string, number>) => [...m.values()].reduce((s, n) => s + n, 0);
        const vTotal = [...input.violations.values()].reduce((s, c) => s + c.a + c.b + c.c, 0);
        const vMatched = r.buildings.reduce((s, b) => s + b.violations.a + b.violations.b + b.violations.c, 0);
        expect(vMatched + r.stats.unmatched.violations).toBe(vTotal);
        expect(r.buildings.reduce((s, b) => s + b.complaints, 0) + r.stats.unmatched.complaints).toBe(total(input.complaints));
        expect(r.buildings.reduce((s, b) => s + b.evictions, 0) + r.stats.unmatched.evictions).toBe(total(input.evictions));
      }),
    );
  });

  it("does not depend on Map insertion order, and does not mutate its input", () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const reversed: AssembleInput = {
          pluto: new Map([...input.pluto].reverse()),
          crosswalk: new Map([...input.crosswalk].reverse()),
          violations: new Map([...input.violations].reverse()),
          complaints: new Map([...input.complaints].reverse()),
          evictions: new Map([...input.evictions].reverse()),
        };
        const before = JSON.stringify([...input.violations]);
        const out = assembleRankings(input);
        out.buildings.forEach((b) => (b.violations.a += 1)); // a caller editing output must not reach input
        expect(JSON.stringify([...input.violations])).toBe(before);
        expect(assembleRankings(reversed)).toEqual(assembleRankings(input));
      }),
    );
  });

  it(`uses ${MIN_NEIGHBORHOOD_SIZE} as the default minimum neighborhood size`, () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        expect(assembleRankings(input)).toEqual(assembleRankings(input, MIN_NEIGHBORHOOD_SIZE));
      }),
    );
  });
});

describe("scale", () => {
  it("assembles 175,000 buildings in a few seconds", () => {
    const n = 175_000;
    const pluto = new Map<string, PlutoBuilding>();
    const violations = new Map<string, ViolationCounts>();
    const crosswalk = new Map<string, NtaInfo>();
    for (let t = 0; t < 2000; t++) {
      crosswalk.set(`3${String(t).padStart(6, "0")}`, { ntaCode: `BK${String(t % 200).padStart(4, "0")}`, ntaName: "x", ntaType: "0" });
    }
    for (let i = 0; i < n; i++) {
      const b = `3${String(i).padStart(9, "0")}`;
      pluto.set(b, { bbl: b, address: "", unitsRes: 3 + (i % 50), tract: `3${String(i % 2000).padStart(6, "0")}` });
      if (i % 4 === 0) violations.set(b, { a: i % 7, b: i % 5, c: i % 3 });
    }
    const t = performance.now();
    const r = assembleRankings({ pluto, crosswalk, violations, complaints: new Map(), evictions: new Map() });
    expect(r.buildings).toHaveLength(n);
    expect(r.stats.byStatus.ranked).toBe(n);
    expect(performance.now() - t).toBeLessThan(5000);
  });
});
