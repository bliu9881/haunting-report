/** In-memory RankingStore for tests. Same validation and all-or-nothing publish as the MariaDB store. */
import type { BuildingMetric, NeighborhoodSummary } from "@haunting/core";
import { assertCivilDate, InvalidRowError, validateBuilding, validateNeighborhood } from "./rows";
import { MAX_TOP, type NewRun, type PublishedRanking, type RankingSnapshot, type RankingStore, type RefreshRun, type RunOutcome } from "./types";

const clone = <T>(x: T): T => structuredClone(x);

interface Live {
  buildings: Map<string, BuildingMetric>;
  neighborhoods: Map<string, NeighborhoodSummary>;
  meta: PublishedRanking | null;
}

export function createMemoryStore(now: () => Date = () => new Date()): RankingStore {
  let live: Live = { buildings: new Map(), neighborhoods: new Map(), meta: null };
  const runs: RefreshRun[] = [];

  return {
    async ensureSchema() {},

    async publish(snapshot: RankingSnapshot, meta: Omit<PublishedRanking, "publishedAt">) {
      assertCivilDate(meta.windowStart, "windowStart");
      assertCivilDate(meta.windowEnd, "windowEnd");
      const next: Live = { buildings: new Map(), neighborhoods: new Map(), meta: null };
      for (const b of snapshot.buildings) {
        validateBuilding(b);
        if (next.buildings.has(b.bbl)) throw new InvalidRowError(`Duplicate building ${b.bbl}`);
        next.buildings.set(b.bbl, clone(b));
      }
      for (const n of snapshot.neighborhoods) {
        validateNeighborhood(n);
        if (next.neighborhoods.has(n.ntaCode)) throw new InvalidRowError(`Duplicate neighborhood ${n.ntaCode}`);
        next.neighborhoods.set(n.ntaCode, clone(n));
      }
      next.meta = { ...clone(meta), publishedAt: now().toISOString() };
      live = next; // the swap
      return clone(next.meta);
    },

    async startRun(run: NewRun) {
      const id = runs.length + 1;
      runs.push({ ...clone(run), id, finishedAt: null, status: "running", sourceAsOf: {}, rowCounts: {}, error: null });
      return id;
    },

    async finishRun(id: number, outcome: RunOutcome) {
      const run = runs.find((r) => r.id === id);
      if (!run) throw new Error(`No refresh run ${id}`);
      Object.assign(run, clone(outcome));
    },

    async lastSuccessfulRun() {
      const ok = runs.filter((r) => r.status === "succeeded");
      return ok.length === 0 ? null : clone(ok[ok.length - 1] as RefreshRun);
    },

    async published() {
      return live.meta === null ? null : clone(live.meta);
    },

    async getBuilding(bbl: string) {
      const b = live.buildings.get(bbl);
      return b === undefined ? null : clone(b);
    },

    async getNeighborhood(ntaCode: string) {
      const n = live.neighborhoods.get(ntaCode);
      return n === undefined ? null : clone(n);
    },

    async topInNeighborhood(ntaCode: string, limit: number) {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_TOP) throw new RangeError(`limit must be 1 to ${MAX_TOP}`);
      return [...live.buildings.values()]
        .filter((b) => b.ntaCode === ntaCode && b.status === "ranked")
        .sort((x, y) => y.score - x.score || (x.bbl < y.bbl ? -1 : 1))
        .slice(0, limit)
        .map(clone);
    },

    async close() {},
  };
}
