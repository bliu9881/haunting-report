import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  FORMULA_VERSION,
  MIN_NEIGHBORHOOD_SIZE,
  rankingWindow,
  rankWithinNeighborhoods,
  score,
  shrunkSources,
  type Scored,
} from "../src/ranking";

const count = fc.integer({ min: 0, max: 5000 });
const counts = fc.record({ a: count, b: count, c: count });
const units = fc.integer({ min: 1, max: 3000 });

describe("score (Requirement 3)", () => {
  it("weights class C 3, B 2, A 1, per residential unit", () => {
    expect(score({ a: 1, b: 1, c: 1 }, 3)).toBe(2);
    expect(score({ a: 0, b: 0, c: 10 }, 6)).toBe(5);
    expect(score({ a: 4, b: 0, c: 0 }, 48)).toBeCloseTo(1 / 12);
  });

  it("rejects invalid input", () => {
    expect(() => score({ a: -1, b: 0, c: 0 }, 3)).toThrow(RangeError);
    expect(() => score({ a: 1.5, b: 0, c: 0 }, 3)).toThrow(RangeError);
    expect(() => score({ a: 0, b: 0, c: 0 }, 0)).toThrow(RangeError);
    expect(() => score({ a: 0, b: 0, c: 0 }, Number.NaN)).toThrow(RangeError);
  });

  it("records the formula version", () => {
    expect(FORMULA_VERSION).toMatch(/^v1:/);
  });

  it("is non-negative, and 0 exactly when there are no violations (3.2)", () => {
    fc.assert(
      fc.property(counts, units, (c, u) => {
        const s = score(c, u);
        expect(s).toBeGreaterThanOrEqual(0);
        expect(s === 0).toBe(c.a + c.b + c.c === 0);
      }),
    );
  });

  it("never decreases when any class count increases (3.2)", () => {
    fc.assert(
      fc.property(counts, units, fc.constantFrom<"a" | "b" | "c">("a", "b", "c"), fc.integer({ min: 1, max: 100 }), (c, u, k, extra) => {
        expect(score({ ...c, [k]: c[k] + extra }, u)).toBeGreaterThan(score(c, u));
      }),
    );
  });

  it("a class C violation always outweighs a class B, and B outweighs A", () => {
    fc.assert(
      fc.property(counts, units, (c, u) => {
        expect(score({ ...c, c: c.c + 1 }, u)).toBeGreaterThan(score({ ...c, b: c.b + 1 }, u));
        expect(score({ ...c, b: c.b + 1 }, u)).toBeGreaterThan(score({ ...c, a: c.a + 1 }, u));
      }),
    );
  });

  it("scales with building size: k times the violations in k times the units is the same score, exactly", () => {
    fc.assert(
      fc.property(counts, units, fc.integer({ min: 2, max: 20 }), (c, u, k) => {
        expect(score({ a: c.a * k, b: c.b * k, c: c.c * k }, u * k)).toBe(score(c, u));
      }),
    );
  });
});

/** Oracle: rank = 1 + number of buildings in the same neighborhood with a strictly higher score. */
function naiveRank(all: readonly Scored[], b: Scored): number {
  return 1 + all.filter((o) => o.ntaCode === b.ntaCode && o.score > b.score).length;
}

const scored = (ntas: string[]) =>
  fc.uniqueArray(
    fc.record({
      bbl: fc.stringMatching(/^[1-5]\d{9}$/),
      ntaCode: fc.constantFrom(...ntas),
      // Few distinct scores, so ties are common, as in the real data (most buildings score 0).
      score: fc.constantFrom(0, 0, 0, 0.5, 1, 1, 2.25, 7),
    }),
    { selector: (b) => b.bbl, maxLength: 120 },
  );

describe("rankWithinNeighborhoods (Requirements 1.3, 1.6)", () => {
  it("uses standard competition ranking: 1, 2, 2, 4", () => {
    const input: Scored[] = [
      { bbl: "3000010001", ntaCode: "BK0802", score: 9 },
      { bbl: "3000010002", ntaCode: "BK0802", score: 5 },
      { bbl: "3000010003", ntaCode: "BK0802", score: 5 },
      { bbl: "3000010004", ntaCode: "BK0802", score: 1 },
    ];
    const ranks = rankWithinNeighborhoods(input, 1).map((r) => r.rank);
    expect(ranks).toEqual([1, 2, 2, 4]);
  });

  it(`gives no rank in a neighborhood with fewer than ${MIN_NEIGHBORHOOD_SIZE} buildings, but reports the count`, () => {
    const small = Array.from({ length: MIN_NEIGHBORHOOD_SIZE - 1 }, (_, i) => ({
      bbl: `30000${String(i).padStart(5, "0")}`,
      ntaCode: "BK0802",
      score: i,
    }));
    const out = rankWithinNeighborhoods(small);
    expect(out.every((r) => r.rank === null && r.moreHauntedThan === null && r.count === small.length)).toBe(true);
    const big = [...small, { bbl: "3999999999", ntaCode: "BK0802", score: 100 }];
    expect(rankWithinNeighborhoods(big).find((r) => r.bbl === "3999999999")?.rank).toBe(1);
  });

  it("matches the naive oracle for every building", () => {
    fc.assert(
      fc.property(scored(["BK0801", "BK0802", "MN0603"]), (bs) => {
        for (const r of rankWithinNeighborhoods(bs, 1)) expect(r.rank).toBe(naiveRank(bs, r));
      }),
    );
  });

  it("outputs every building exactly once, with its own neighborhood's count", () => {
    fc.assert(
      fc.property(scored(["BK0801", "BK0802", "MN0603"]), (bs) => {
        const out = rankWithinNeighborhoods(bs);
        expect(out.map((r) => r.bbl).sort()).toEqual(bs.map((b) => b.bbl).sort());
        for (const r of out) expect(r.count).toBe(bs.filter((b) => b.ntaCode === r.ntaCode).length);
      }),
    );
  });

  it("equal scores share a rank; a higher score always ranks better; ranks stay within 1..count", () => {
    fc.assert(
      fc.property(scored(["BK0801", "BK0802"]), (bs) => {
        const out = rankWithinNeighborhoods(bs, 1);
        for (const x of out) {
          expect(x.rank).toBeGreaterThanOrEqual(1);
          expect(x.rank).toBeLessThanOrEqual(x.count);
          for (const y of out) {
            if (x.ntaCode !== y.ntaCode) continue;
            if (x.score === y.score) expect(x.rank).toBe(y.rank);
            if (x.score > y.score) expect(x.rank as number).toBeLessThan(y.rank as number);
          }
        }
      }),
    );
  });

  it("moreHauntedThan is the share with a strictly lower score, in [0, 1)", () => {
    fc.assert(
      fc.property(scored(["BK0801", "BK0802"]), (bs) => {
        for (const r of rankWithinNeighborhoods(bs, 1)) {
          const same = bs.filter((b) => b.ntaCode === r.ntaCode);
          expect(r.moreHauntedThan).toBe(same.filter((b) => b.score < r.score).length / same.length);
          expect(r.moreHauntedThan).toBeLessThan(1);
        }
      }),
    );
  });

  it("does not depend on input order", () => {
    fc.assert(
      fc.property(scored(["BK0801", "BK0802"]), (bs) => {
        expect(rankWithinNeighborhoods([...bs].reverse())).toEqual(rankWithinNeighborhoods(bs));
      }),
    );
  });

  it("ranks a realistic neighborhood quickly, with most buildings tied at 0", () => {
    const n = 20_000;
    const bs: Scored[] = Array.from({ length: n }, (_, i) => ({
      bbl: `3${String(i).padStart(9, "0")}`,
      ntaCode: "BK0802",
      score: i % 10 === 0 ? i / n : 0,
    }));
    const t = performance.now();
    rankWithinNeighborhoods(bs);
    expect(performance.now() - t).toBeLessThan(500);
  });
});

describe("rankingWindow (Requirement 3.4)", () => {
  it("covers 36 months of civil dates", () => {
    expect(rankingWindow("2026-11-25")).toEqual({ start: "2023-11-25", end: "2026-11-25" });
  });

  it("clamps 29 February into a non-leap start year", () => {
    expect(rankingWindow("2028-02-29")).toEqual({ start: "2025-02-28", end: "2028-02-29" });
  });

  it("rejects invalid dates", () => {
    for (const bad of ["2026-02-29", "2026-13-01", "2026-00-10", "2026-04-31", "26-11-25", "2026-11-25T00:00", ""]) {
      expect(rankingWindow(bad)).toBeNull();
    }
  });

  it("for every valid date, start is exactly three years earlier and sorts before end", () => {
    fc.assert(
      fc.property(fc.date({ min: new Date("2000-01-01T00:00:00Z"), max: new Date("2099-12-31T00:00:00Z"), noInvalidDate: true }), (d) => {
        const end = d.toISOString().slice(0, 10);
        const w = rankingWindow(end);
        expect(w).not.toBeNull();
        expect(Number(w!.start.slice(0, 4))).toBe(Number(end.slice(0, 4)) - 3);
        expect(w!.start < w!.end).toBe(true);
        expect(w!.start.slice(5, 7)).toBe(end.slice(5, 7));
      }),
    );
  });
});

describe("shrunkSources (Requirement 4.3)", () => {
  it("flags a source below 80% of its last successful count", () => {
    expect(shrunkSources({ pluto: 172_630, violations: 70_000 }, { pluto: 172_000, violations: 90_000 })).toEqual(["violations"]);
  });

  it("does not flag exactly 80%, growth, or a first run", () => {
    expect(shrunkSources({ v: 80 }, { v: 100 })).toEqual([]);
    expect(shrunkSources({ v: 500 }, { v: 100 })).toEqual([]);
    expect(shrunkSources({ v: 0 }, null)).toEqual([]);
  });

  it("treats a missing source as zero rows", () => {
    expect(shrunkSources({}, { evictions: 10 })).toEqual(["evictions"]);
  });

  it("flags a source exactly when it fell below the ratio", () => {
    fc.assert(
      fc.property(
        fc.dictionary(fc.constantFrom("pluto", "violations", "complaints", "evictions"), fc.integer({ min: 1, max: 1_000_000 })),
        fc.double({ min: 0, max: 2, noNaN: true }),
        (prev, factor) => {
          const curr = Object.fromEntries(Object.entries(prev).map(([k, v]) => [k, Math.floor(v * factor)]));
          const flagged = shrunkSources(curr, prev);
          for (const k of Object.keys(prev)) expect(flagged.includes(k)).toBe((curr[k] as number) < (prev[k] as number) * 0.8);
        },
      ),
    );
  });
});
