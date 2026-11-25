import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { DATASETS, FORMULA_VERSION } from "@haunting/core";
import { createMemoryStore, type RankingStore } from "@haunting/store";
import { MIN_ROWS, newYorkDate, runRefresh, type RefreshDeps } from "../src/refresh";

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`../../../packages/core/test/fixtures/socrata-${name}.json`, import.meta.url), "utf8"));

const BUILDING_A = "3013610043";
const AS_OF_SECS = 1795623168;
const NOW = new Date("2026-11-26T04:00:00Z"); // 23:00 on 25 Nov in New York
const NO_FLOORS = Object.fromEntries(Object.keys(MIN_ROWS).map((k) => [k, 0]));

type Override = (dataset: string, url: URL) => Response | Promise<Response> | undefined;

/** Serves the recorded Socrata responses by dataset id. Grouped borough queries only answer for Brooklyn. */
function socrataFetch(override?: Override) {
  return vi.fn(async (u: string, init?: RequestInit) => {
    const url = new URL(u);
    const view = /^\/api\/views\/([a-z0-9-]+)\.json$/.exec(url.pathname);
    const resource = /^\/resource\/([a-z0-9-]+)\.json$/.exec(url.pathname);
    const dataset = (view ?? resource)?.[1] ?? "";
    const o = await override?.(dataset, url);
    if (o) return o;
    if (init?.signal?.aborted) throw init.signal.reason;
    if (view) return Response.json({ rowsUpdatedAt: AS_OF_SECS });
    const where = url.searchParams.get("$where") ?? "";
    switch (dataset) {
      case DATASETS.crosswalk:
        return Response.json(fixture("crosswalk"));
      case DATASETS.pluto:
        return Response.json(fixture("pluto"));
      case DATASETS.violations:
        return Response.json(where.includes("'BROOKLYN'") ? fixture("violations-brooklyn") : []);
      case DATASETS.complaints:
        return Response.json(where.includes("'BROOKLYN'") ? fixture("complaints-brooklyn") : []);
      case DATASETS.evictions:
        return Response.json(fixture("evictions"));
      default:
        return new Response("not found", { status: 404 });
    }
  }) as unknown as typeof fetch;
}

function deps(store: RankingStore, extra: Partial<RefreshDeps> = {}): RefreshDeps {
  return { store, fetch: socrataFetch(), now: () => NOW, log: () => undefined, retryDelayMs: 0, minRows: NO_FLOORS, ...extra };
}

describe("newYorkDate", () => {
  it("uses the New York civil date, not the UTC one", () => {
    expect(newYorkDate(new Date("2026-11-26T04:00:00Z"))).toBe("2026-11-25");
    expect(newYorkDate(new Date("2026-11-26T05:00:00Z"))).toBe("2026-11-26");
    expect(newYorkDate(new Date("2026-07-01T03:59:00Z"))).toBe("2026-06-30"); // EDT, UTC-4
  });
});

describe("runRefresh", () => {
  it("publishes the assembled rankings and records a succeeded run", async () => {
    const store = createMemoryStore();
    const lines: string[] = [];
    const r = await runRefresh(deps(store, { log: (l) => lines.push(l) }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(r.published).toMatchObject({ runId: r.runId, formulaVersion: FORMULA_VERSION, windowStart: "2023-11-25", windowEnd: "2026-11-25" });
    expect(Object.keys(r.published.sourceAsOf).sort()).toEqual(Object.keys(DATASETS).sort());
    expect(r.published.sourceAsOf.pluto).toBe(new Date(AS_OF_SECS * 1000).toISOString());
    expect(await store.getBuilding(BUILDING_A)).toMatchObject({ score: 9.5, violations: { a: 21, b: 102, c: 77 }, complaints: 64, ntaCode: "BK0802" });

    const run = await store.lastSuccessfulRun();
    expect(run).toMatchObject({ id: r.runId, status: "succeeded", error: null, rowCounts: r.rowCounts });
    expect(Object.keys(r.rowCounts).sort()).toEqual(["complaints", "crosswalk", "evictions", "pluto", "violations"]);
    expect(lines.some((l) => l.includes("unmatched:"))).toBe(true);
  });

  it("fails on a source error, names it, records the failure, and publishes nothing", async () => {
    const store = createMemoryStore();
    const f = socrataFetch((ds) => (ds === DATASETS.violations ? new Response("{}", { status: 400 }) : undefined));
    const r = await runRefresh(deps(store, { fetch: f }));
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/^violations: http: MANHATTAN: HTTP 400/) });
    expect(await store.published()).toBeNull();
    expect(await store.lastSuccessfulRun()).toBeNull();
  });

  it("keeps the previous rankings live when a later run fails", async () => {
    const store = createMemoryStore();
    const first = await runRefresh(deps(store));
    expect(first.ok).toBe(true);
    const before = await store.published();
    const f = socrataFetch((ds) => (ds === DATASETS.evictions ? new Response("{}", { status: 503 }) : undefined));
    const second = await runRefresh(deps(store, { fetch: f }));
    expect(second.ok).toBe(false);
    expect(await store.published()).toEqual(before);
    expect(await store.getBuilding(BUILDING_A)).toMatchObject({ score: 9.5 });
  });

  it("refuses to publish when a source shrank below 80% of the last good run", async () => {
    const store = createMemoryStore();
    expect((await runRefresh(deps(store))).ok).toBe(true);
    const before = await store.published();
    // Brooklyn violations now come back with only 2 of their 11 rows.
    const f = socrataFetch((ds, url) =>
      ds === DATASETS.violations && (url.searchParams.get("$where") ?? "").includes("'BROOKLYN'")
        ? Response.json((fixture("violations-brooklyn") as unknown[]).slice(0, 2))
        : undefined,
    );
    const r = await runRefresh(deps(store, { fetch: f }));
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining("violations 2 vs 11") });
    expect(await store.published()).toEqual(before);
  });

  it("refuses to publish a first run below the absolute floors", async () => {
    const store = createMemoryStore();
    const r = await runRefresh(deps(store, { minRows: undefined }));
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/^Too few rows: crosswalk 4 < 2000, pluto 3 < 150000/) });
    expect(await store.published()).toBeNull();
  });

  it("stops at the deadline and records the run as failed, instead of hanging", async () => {
    const store = createMemoryStore();
    const hang = socrataFetch((ds, url) =>
      ds === DATASETS.pluto && url.pathname.startsWith("/resource")
        ? new Promise<Response>(() => undefined) // never answers; only the deadline signal can end it
        : undefined,
    );
    const f = vi.fn((u: string, init?: RequestInit) => {
      const p = (hang as unknown as (u: string, i?: RequestInit) => Promise<Response>)(u, init);
      return new Promise<Response>((resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        p.then(resolve, reject);
      });
    }) as unknown as typeof fetch;
    const t = performance.now();
    const r = await runRefresh(deps(store, { fetch: f, deadlineMs: 50 }));
    expect(performance.now() - t).toBeLessThan(2000);
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/^Deadline of 50 ms passed: pluto: aborted/) });
    const runs = await store.lastSuccessfulRun();
    expect(runs).toBeNull();
  });

  it("records a failure when the store itself fails, without throwing", async () => {
    const store = createMemoryStore();
    const broken: RankingStore = { ...store, publish: async () => Promise.reject(new Error("disk full")) };
    const r = await runRefresh(deps(broken));
    expect(r).toMatchObject({ ok: false, error: "disk full" });
    expect(await store.published()).toBeNull();
  });
});
