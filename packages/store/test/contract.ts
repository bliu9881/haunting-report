/** Behavior every RankingStore must have. Run against the in-memory store always, and MariaDB when enabled. */
import { describe, expect, it } from "vitest";
import type { BuildingMetric } from "@haunting/core";
import { InvalidRowError, MAX_TOP, type RankingStore } from "../src";
import { makeSnapshot, META } from "./helpers";

export function runStoreContract(name: string, open: () => Promise<RankingStore>, opts: { timeoutMs?: number } = {}) {
  const timeout = opts.timeoutMs ?? 5000;

  describe(`${name}: RankingStore contract`, () => {
    it("starts empty", { timeout }, async () => {
      const s = await open();
      await s.ensureSchema();
      expect(await s.published()).toBeNull();
      expect(await s.getBuilding("3000010001")).toBeNull();
      expect(await s.getNeighborhood("BK0802")).toBeNull();
      expect(await s.topInNeighborhood("BK0802", 10)).toEqual([]);
      expect(await s.lastSuccessfulRun()).toBeNull();
    });

    it("publishes a snapshot that reads back exactly, scores included", { timeout }, async () => {
      const s = await open();
      const snap = makeSnapshot();
      const meta = await s.publish(snap, META);
      expect(meta).toMatchObject(META);
      expect(Number.isNaN(Date.parse(meta.publishedAt))).toBe(false);
      expect(await s.published()).toEqual(meta);
      for (const b of snap.buildings) expect(await s.getBuilding(b.bbl)).toEqual(b);
      for (const n of snap.neighborhoods) expect(await s.getNeighborhood(n.ntaCode)).toEqual(n);
    });

    it("lists a neighborhood's ranked buildings by score, ties by BBL, up to the limit", { timeout }, async () => {
      const s = await open();
      const snap = makeSnapshot();
      await s.publish(snap, META);
      for (const n of snap.neighborhoods) {
        const expected = snap.buildings
          .filter((b) => b.ntaCode === n.ntaCode && b.status === "ranked")
          .sort((x, y) => y.score - x.score || (x.bbl < y.bbl ? -1 : 1));
        expect(await s.topInNeighborhood(n.ntaCode, 5)).toEqual(expected.slice(0, 5));
        expect(await s.topInNeighborhood(n.ntaCode, MAX_TOP)).toEqual(expected.slice(0, MAX_TOP));
      }
      await expect(s.topInNeighborhood("BK0802", 0)).rejects.toThrow(RangeError);
      await expect(s.topInNeighborhood("BK0802", MAX_TOP + 1)).rejects.toThrow(RangeError);
    });

    it("replaces everything on the next publish: no rows survive from the previous one", { timeout }, async () => {
      const s = await open();
      const first = makeSnapshot(90, 0);
      await s.publish(first, META);
      const second = makeSnapshot(40, 3);
      await s.publish(second, { ...META, runId: 2 });
      expect((await s.published())?.runId).toBe(2);
      const gone = first.buildings.filter((b) => !second.buildings.some((o) => o.bbl === b.bbl));
      expect(gone.length).toBeGreaterThan(0);
      for (const b of gone) expect(await s.getBuilding(b.bbl)).toBeNull();
      for (const b of second.buildings) expect(await s.getBuilding(b.bbl)).toEqual(b);
    });

    it("rejects an invalid snapshot and keeps serving the previous rankings", { timeout }, async () => {
      const s = await open();
      const good = makeSnapshot();
      const meta = await s.publish(good, META);
      const bad: BuildingMetric = { ...(good.buildings[0] as BuildingMetric), bbl: "not-a-bbl" };
      await expect(s.publish({ ...good, buildings: [...good.buildings, bad] }, { ...META, runId: 9 })).rejects.toThrow(InvalidRowError);
      const dup = good.buildings[1] as BuildingMetric;
      await expect(s.publish({ ...good, buildings: [...good.buildings, dup] }, { ...META, runId: 9 })).rejects.toThrow(/Duplicate/);
      await expect(s.publish(good, { ...META, windowEnd: "25/11/2026" })).rejects.toThrow(InvalidRowError);
      expect(await s.published()).toEqual(meta);
      for (const b of good.buildings.slice(0, 10)) expect(await s.getBuilding(b.bbl)).toEqual(b);
    });

    it("records refresh runs, and lastSuccessfulRun ignores failed and unfinished ones", { timeout }, async () => {
      const s = await open();
      const base = { formulaVersion: "v1:test", windowStart: "2023-11-25", windowEnd: "2026-11-25" };
      const ok1 = await s.startRun({ ...base, startedAt: "2026-11-24T04:00:00.000Z" });
      await s.finishRun(ok1, {
        finishedAt: "2026-11-24T04:02:00.000Z",
        status: "succeeded",
        sourceAsOf: { pluto: "2026-11-20T04:00:00.000Z" },
        rowCounts: { pluto: 172_630, violations: 320_000 },
        error: null,
      });
      const failed = await s.startRun({ ...base, startedAt: "2026-11-25T04:00:00.000Z" });
      await s.finishRun(failed, { finishedAt: "2026-11-25T04:01:00.000Z", status: "failed", sourceAsOf: {}, rowCounts: {}, error: "violations shrank" });
      await s.startRun({ ...base, startedAt: "2026-11-26T04:00:00.000Z" }); // still running

      const last = await s.lastSuccessfulRun();
      expect(last).toEqual({
        ...base,
        id: ok1,
        startedAt: "2026-11-24T04:00:00.000Z",
        finishedAt: "2026-11-24T04:02:00.000Z",
        status: "succeeded",
        sourceAsOf: { pluto: "2026-11-20T04:00:00.000Z" },
        rowCounts: { pluto: 172_630, violations: 320_000 },
        error: null,
      });
      await expect(s.finishRun(999_999, { finishedAt: null, status: "failed", sourceAsOf: {}, rowCounts: {}, error: "x" })).rejects.toThrow();
    });

    it("returns copies: editing a read result does not change stored data", { timeout }, async () => {
      const s = await open();
      const snap = makeSnapshot();
      await s.publish(snap, META);
      const b = snap.buildings[0] as BuildingMetric;
      const read = (await s.getBuilding(b.bbl)) as BuildingMetric;
      read.violations.a += 100;
      expect(await s.getBuilding(b.bbl)).toEqual(b);
    });
  });
}
