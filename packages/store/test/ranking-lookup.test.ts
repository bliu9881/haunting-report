import { describe, expect, it } from "vitest";
import type { BuildingMetric } from "@haunting/core";
import { createMemoryStore, getRanking, type RankingStore } from "../src";
import { makeSnapshot, META } from "./helpers";

async function published() {
  const store = createMemoryStore();
  const snap = makeSnapshot();
  await store.publish(snap, META);
  return { store, snap };
}

const find = (bs: readonly BuildingMetric[], pred: (b: BuildingMetric) => boolean) => {
  const b = bs.find(pred);
  if (!b) throw new Error("fixture has no such building");
  return b;
};

describe("getRanking (Requirement 1)", () => {
  it("returns the rank, neighborhood size, median and as-of data for a ranked building (1.1, 1.4)", async () => {
    const { store, snap } = await published();
    const b = find(snap.buildings, (x) => x.status === "ranked");
    const n = snap.neighborhoods.find((x) => x.ntaCode === b.ntaCode);
    expect(n).toBeDefined();
    const r = await getRanking(store, b.bbl);
    expect(r).toMatchObject({ kind: "ranked", building: b, neighborhoodMedian: n?.medianScore, asOf: { runId: META.runId } });
  });

  it("accepts a BBL in any form normalizeBbl accepts", async () => {
    const { store, snap } = await published();
    const b = find(snap.buildings, (x) => x.status === "ranked");
    expect((await getRanking(store, `${b.bbl}.00000000`)).kind).toBe("ranked");
  });

  it.each(["no_tract", "non_residential_nta"] as const)("says why a %s building has no rank (1.2)", async (status) => {
    const { store, snap } = await published();
    const b = find(snap.buildings, (x) => x.status === status);
    expect(await getRanking(store, b.bbl)).toMatchObject({ kind: "not_rankable", reason: status, building: b });
  });

  it("says when the neighborhood is too small (1.3)", async () => {
    const store = createMemoryStore();
    const snap = makeSnapshot(30);
    // Re-label ranked buildings as the assembler does for a neighborhood under 20 buildings.
    const small = snap.buildings.map((b) =>
      b.status === "ranked" ? { ...b, status: "small_neighborhood" as const, rank: null, moreHauntedThan: null } : b,
    );
    await store.publish({ ...snap, buildings: small }, META);
    const b = find(small, (x) => x.status === "small_neighborhood");
    expect(await getRanking(store, b.bbl)).toMatchObject({ kind: "not_rankable", reason: "small_neighborhood" });
  });

  it("explains a building that is not in the rankings, and an empty database", async () => {
    const { store } = await published();
    expect(await getRanking(store, "3999999999")).toMatchObject({ kind: "not_rankable", reason: "not_in_rankings", building: null });
    expect(await getRanking(store, "garbage")).toMatchObject({ kind: "not_rankable", reason: "not_in_rankings" });
    expect(await getRanking(createMemoryStore(), "3013610043")).toEqual({
      kind: "not_rankable",
      reason: "no_rankings_yet",
      building: null,
      asOf: null,
    });
  });

  it("marks the section unavailable when the database fails or hangs, without throwing (1.5)", async () => {
    const { store } = await published();
    const failing: RankingStore = { ...store, getBuilding: () => Promise.reject(new Error("ECONNREFUSED")) };
    expect(await getRanking(failing, "3013610043")).toEqual({
      kind: "error",
      source: "rankings",
      reason: "network",
      message: "ECONNREFUSED",
    });
    const hanging: RankingStore = { ...store, published: () => new Promise(() => undefined) };
    const t = performance.now();
    expect(await getRanking(hanging, "3013610043", 30)).toMatchObject({ kind: "error", source: "rankings", reason: "timeout" });
    expect(performance.now() - t).toBeLessThan(1000);
  });
});
