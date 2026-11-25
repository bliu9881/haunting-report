import { describe, expect, it } from "vitest";
import fc from "fast-check";
import type { BuildingMetric, RankStatus } from "@haunting/core";
import {
  BUILDING_COLUMNS,
  buildingToRow,
  createSwapped,
  fromSqlDateTime,
  InvalidRowError,
  rowToBuilding,
  swapStatement,
  tableNames,
  toSqlDateTime,
  validateBuilding,
} from "../src";

const count = fc.nat(10_000);
const buildingArb: fc.Arbitrary<BuildingMetric> = fc
  .record({
    bbl: fc.stringMatching(/^[1-5]\d{9}$/),
    address: fc.string({ maxLength: 60 }),
    unitsRes: fc.integer({ min: 3, max: 3000 }),
    ntaCode: fc.option(fc.stringMatching(/^[A-Z]{2}\d{4}$/), { nil: null }),
    ntaName: fc.option(fc.string({ maxLength: 60 }), { nil: null }),
    violations: fc.record({ a: count, b: count, c: count }),
    complaints: count,
    evictions: count,
    score: fc.double({ min: 0, max: 1e6, noNaN: true, noDefaultInfinity: true }),
    status: fc.constantFrom<RankStatus>("ranked", "small_neighborhood", "non_residential_nta", "unknown_tract", "no_tract"),
    neighborhoodCount: fc.option(fc.integer({ min: 1, max: 5000 }), { nil: null }),
    rank: fc.integer({ min: 1, max: 5000 }),
    moreHauntedThan: fc.double({ min: 0, max: 0.999, noNaN: true }),
  })
  .map((b) => ({
    ...b,
    rank: b.status === "ranked" ? b.rank : null,
    moreHauntedThan: b.status === "ranked" ? b.moreHauntedThan : null,
  }));

/** A DB row as mysql2 returns it: column name → value. */
const asDbRow = (values: unknown[]) => Object.fromEntries(BUILDING_COLUMNS.map((c, i) => [c, values[i]]));

describe("building rows", () => {
  it("round-trips every valid building exactly", () => {
    fc.assert(
      fc.property(buildingArb, (b) => {
        validateBuilding(b);
        expect(rowToBuilding(asDbRow(buildingToRow(b)))).toEqual(b);
      }),
    );
  });

  it("produces one value per column", () => {
    fc.assert(
      fc.property(buildingArb, (b) => {
        expect(buildingToRow(b)).toHaveLength(BUILDING_COLUMNS.length);
      }),
    );
  });

  it("clips text to 255 characters instead of failing the whole publish", () => {
    fc.assert(
      fc.property(buildingArb, fc.string({ minLength: 256, maxLength: 400 }), (b, long) => {
        const row = buildingToRow({ ...b, address: long });
        expect((row[1] as string).length).toBe(255);
      }),
    );
  });

  it("rejects buildings the database would refuse or the UI would misread", () => {
    const ok = fc.sample(buildingArb, 1)[0] as BuildingMetric;
    const bad: Partial<BuildingMetric>[] = [
      { bbl: "0" },
      { unitsRes: 0 },
      { complaints: -1 },
      { violations: { a: 1.5, b: 0, c: 0 } },
      { score: Number.NaN },
      { score: -1 },
      { status: "haunted" as RankStatus },
      { status: "ranked", rank: null },
      { status: "no_tract", rank: 3 },
      { moreHauntedThan: 1 },
      { ntaCode: "TOO-LONG-CODE" },
    ];
    for (const patch of bad) expect(() => validateBuilding({ ...ok, ...patch } as BuildingMetric)).toThrow(InvalidRowError);
  });
});

describe("datetimes", () => {
  it("round-trips ISO instants through DATETIME(3) text, in UTC", () => {
    fc.assert(
      fc.property(fc.date({ min: new Date("2000-01-01T00:00:00Z"), max: new Date("2099-12-31T23:59:59Z"), noInvalidDate: true }), (d) => {
        const iso = d.toISOString();
        const sql = toSqlDateTime(iso);
        expect(sql).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}$/);
        expect(fromSqlDateTime(sql)).toBe(iso);
      }),
    );
  });

  it("rejects an invalid instant", () => {
    expect(() => toSqlDateTime("yesterday")).toThrow(InvalidRowError);
  });
});

describe("schema", () => {
  it("swaps all three tables in one RENAME statement", () => {
    expect(swapStatement(tableNames())).toBe(
      "RENAME TABLE `building_metric` TO `building_metric_old`, `building_metric_next` TO `building_metric`, " +
        "`nta_summary` TO `nta_summary_old`, `nta_summary_next` TO `nta_summary`, " +
        "`ranking_meta` TO `ranking_meta_old`, `ranking_meta_next` TO `ranking_meta`",
    );
  });

  it("creates live tables only if missing, and _next tables fresh", () => {
    expect(createSwapped(tableNames(), "").every((d) => d.startsWith("CREATE TABLE IF NOT EXISTS"))).toBe(true);
    expect(createSwapped(tableNames(), "_next").every((d) => /^CREATE TABLE `\w+_next`/.test(d))).toBe(true);
  });

  it("accepts only safe table prefixes", () => {
    expect(tableNames("t1abc_").buildingMetric).toBe("t1abc_building_metric");
    for (const bad of ["1t_", "t;drop", "T_", "t`x", "a".repeat(30)]) expect(() => tableNames(bad)).toThrow(TypeError);
  });
});
