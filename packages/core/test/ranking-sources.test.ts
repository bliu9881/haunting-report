import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import fc from "fast-check";
import {
  addCountRows,
  addViolationRows,
  fetchComplaintCounts,
  fetchCrosswalk,
  fetchEvictionCounts,
  fetchPluto,
  fetchViolationCounts,
  windowClause,
  type ViolationCounts,
} from "../src/ranking";
import { normalizeBbl } from "../src/identifiers";

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`./fixtures/socrata-${name}.json`, import.meta.url), "utf8"));

const W = { start: "2023-11-25", end: "2026-11-25" };
const fast = { retryDelayMs: 0 };
const BUILDING_A = "3013610043";

/** Serves `byBorough[borough]` for queries whose $where names that borough, and [] otherwise. */
function boroughFetch(byBorough: Record<string, unknown>) {
  return vi.fn(async (u: string) => {
    const where = new URL(u).searchParams.get("$where") ?? "";
    const hit = Object.keys(byBorough).find((b) => where.includes(`'${b}'`));
    return new Response(JSON.stringify(hit ? byBorough[hit] : []));
  }) as unknown as typeof fetch & { mock: { calls: [string][] } };
}
const where = (f: { mock: { calls: [string][] } }, i: number) => new URL(f.mock.calls[i]![0]).searchParams.get("$where");

describe("windowClause", () => {
  it("covers whole civil days at both ends", () => {
    expect(windowClause("inspectiondate", W)).toBe("inspectiondate >= '2023-11-25' AND inspectiondate <= '2026-11-25T23:59:59.999'");
  });
});

describe("fetchViolationCounts (task 4.3)", () => {
  it("sums classes A, B and C per building from the recorded Brooklyn response", async () => {
    const f = boroughFetch({ BROOKLYN: fixture("violations-brooklyn") });
    const r = await fetchViolationCounts(W, { fetch: f, ...fast });
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    expect(r.data.data.get(BUILDING_A)).toEqual({ a: 21, b: 102, c: 77 });
    expect(r.data.dropped).toBe(2); // two rows with bbl "0"
    expect(r.data.rowCount).toBe(11);
    expect(r.data.data.has("3041160064")).toBe(false); // class I only
  });

  it("queries each of the five boroughs once, inside the window", async () => {
    const f = boroughFetch({});
    await fetchViolationCounts(W, { fetch: f, ...fast });
    expect(f).toHaveBeenCalledTimes(5);
    expect(where(f, 4)).toBe("boro = 'STATEN ISLAND' AND " + windowClause("inspectiondate", W));
  });

  it("fails the whole source, naming the borough, if one borough fails", async () => {
    let n = 0;
    const f = vi.fn(async () => (++n === 3 ? new Response("{}", { status: 400 }) : new Response("[]"))) as unknown as typeof fetch;
    expect(await fetchViolationCounts(W, { fetch: f, ...fast })).toMatchObject({
      kind: "error",
      source: "violations",
      message: expect.stringContaining("BROOKLYN"),
    });
  });
});

describe("fetchComplaintCounts (task 4.4)", () => {
  it("counts distinct complaints, and drops rows without a usable BBL", async () => {
    const f = boroughFetch({ BROOKLYN: fixture("complaints-brooklyn") });
    const r = await fetchComplaintCounts(W, { fetch: f, ...fast });
    if (r.kind !== "ok") throw new Error(r.message);
    expect(r.data.data.get(BUILDING_A)).toBe(64);
    expect(r.data.dropped).toBe(2); // bbl "0" and a missing bbl
    expect(new URL(f.mock.calls[0]![0]).searchParams.get("$select")).toContain("count(distinct complaint_id)");
  });

  it("sums a BBL that appears under two borough queries", async () => {
    const f = boroughFetch({ MANHATTAN: [{ bbl: BUILDING_A, n: "2" }], BROOKLYN: [{ bbl: BUILDING_A, n: "64" }] });
    const r = await fetchComplaintCounts(W, { fetch: f, ...fast });
    expect(r.kind === "ok" && r.data.data.get(BUILDING_A)).toBe(66);
  });
});

describe("fetchEvictionCounts (task 4.5)", () => {
  it("runs one citywide query for residential evictions in the window", async () => {
    const f = boroughFetch({ Residential: fixture("evictions") });
    const r = await fetchEvictionCounts(W, { fetch: f, ...fast });
    if (r.kind !== "ok") throw new Error(r.message);
    expect(f).toHaveBeenCalledTimes(1);
    expect(where(f, 0)).toBe("residential_commercial_ind = 'Residential' AND " + windowClause("executed_date", W));
    expect(r.data.data.get("2033200060")).toBe(3);
    expect(r.data.dropped).toBe(2);
  });
});

describe("fetchPluto (task 4.2)", () => {
  it("normalizes PLUTO's float BBLs, keeps 3+ unit buildings, and keeps a missing tract as null", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify(fixture("pluto")))) as unknown as typeof fetch;
    const r = await fetchPluto({ fetch: f, ...fast });
    if (r.kind !== "ok") throw new Error(r.message);
    expect(r.data.data.get(BUILDING_A)).toEqual({ bbl: BUILDING_A, address: "1248 ST MARKS AVENUE", unitsRes: 48, tract: "3034700" });
    expect(r.data.data.has("1015500031")).toBe(false); // building B: 0 residential units
    expect(r.data.data.get("1005720026")?.tract).toBeNull();
    expect(r.data.dropped).toBe(1);
  });
});

describe("fetchCrosswalk (task 4.1)", () => {
  it("maps 2020 tracts to NTAs, keeping the NTA type", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify(fixture("crosswalk")))) as unknown as typeof fetch;
    const r = await fetchCrosswalk({ fetch: f, ...fast });
    if (r.kind !== "ok") throw new Error(r.message);
    expect(r.data.data.get("3034700")).toEqual({ ntaCode: "BK0802", ntaName: "Crown Heights (North)", ntaType: "0" });
    expect(r.data.data.get("4071600")?.ntaType).toBe("8"); // JFK airport: not residential
  });
});

const bbl = fc.stringMatching(/^[1-5]\d{9}$/);
const violationRow = fc.record({ bbl: fc.oneof(bbl, fc.constant("0")), class: fc.constantFrom("A", "B", "C", "I"), n: fc.nat(500).map(String) });

describe("merge properties", () => {
  it("violation totals equal the sum of scored rows with a valid BBL, however the rows are split", () => {
    fc.assert(
      fc.property(fc.array(violationRow, { maxLength: 60 }), fc.nat(60), (rows, cut) => {
        const split = new Map<string, ViolationCounts>();
        addViolationRows(split, rows.slice(0, cut));
        addViolationRows(split, rows.slice(cut));
        const whole = new Map<string, ViolationCounts>();
        addViolationRows(whole, rows);
        expect(split).toEqual(whole);
        const expected = rows.filter((r) => r.bbl !== "0" && r.class !== "I").reduce((s, r) => s + Number(r.n), 0);
        const total = [...whole.values()].reduce((s, c) => s + c.a + c.b + c.c, 0);
        expect(total).toBe(expected);
      }),
    );
  });

  it("count merging keeps exactly the valid rows' total, drops the rest, and never throws on junk", () => {
    const junkRow = fc.record({
      bbl: fc.oneof(bbl, fc.string(), fc.constant(undefined)),
      n: fc.oneof(fc.nat(99).map(String), fc.string()),
    });
    fc.assert(
      fc.property(fc.array(junkRow, { maxLength: 40 }), (rows) => {
        const into = new Map<string, number>();
        const dropped = addCountRows(into, rows as Record<string, unknown>[]);
        const valid = rows.filter((r) => normalizeBbl(r.bbl) !== null && /^\d+$/.test(r.n));
        expect(dropped).toBe(rows.length - valid.length);
        expect([...into.values()].reduce((s, v) => s + v, 0)).toBe(valid.reduce((s, r) => s + Number(r.n), 0));
        for (const k of into.keys()) expect(k).toMatch(/^[1-5]\d{9}$/);
      }),
    );
  });
});
