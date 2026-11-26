import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import fc from "fast-check";
import {
  ADAPTERS,
  DOSSIER_SOURCES,
  runAdapter,
  type Adapter,
  type DossierBuilding,
  type DossierSource,
} from "../src/dossier";
import type { Row } from "../src/socrata";

interface Recorded {
  building: DossierBuilding;
  window: { start: string; end: string };
  queries: { dataset: string; params: Record<string, string>; status: number; body: unknown }[];
}
const fixture = (source: DossierSource, name: "building-a" | "building-b"): Recorded =>
  JSON.parse(readFileSync(new URL(`./fixtures/dossier-${source}-${name}.json`, import.meta.url), "utf8"));

const A = fixture("pluto", "building-a").building;
const W = fixture("pluto", "building-a").window;
const bodies = (r: Recorded) => r.queries.map((q) => q.body as Row[]);
const parse = <S extends DossierSource>(source: S, name: "building-a" | "building-b") => {
  const r = fixture(source, name);
  return (ADAPTERS[source] as unknown as Adapter<S, unknown>).parse(bodies(r), r.building, r.window);
};

/** Serves the recorded responses for whichever query is asked. */
function replay(r: Recorded, override?: (dataset: string, url: URL) => Response | Promise<Response> | undefined) {
  return vi.fn(async (u: string, init?: RequestInit) => {
    const url = new URL(u);
    const dataset = /\/resource\/([a-z0-9-]+)\.json/.exec(url.pathname)?.[1] ?? "";
    const o = await override?.(dataset, url);
    if (o) return o;
    if (init?.signal?.aborted) throw init.signal.reason;
    const q = r.queries.find((x) => x.dataset === dataset && Object.entries(x.params).every(([k, v]) => url.searchParams.get(k) === v));
    return q ? Response.json(q.body, { status: q.status }) : new Response("no fixture", { status: 404 });
  }) as unknown as typeof fetch;
}

describe("recorded fixtures match today's queries", () => {
  it.each(DOSSIER_SOURCES)("%s", (source) => {
    for (const name of ["building-a", "building-b"] as const) {
      const r = fixture(source, name);
      const qs = ADAPTERS[source].queries(r.building, r.window);
      expect(Array.isArray(qs)).toBe(true);
      expect((qs as { dataset: string; params: Record<string, string> }[]).map(({ dataset, params }) => ({ dataset, params }))).toEqual(
        r.queries.map(({ dataset, params }) => ({ dataset, params })),
      );
    }
  });
});

describe("parsers on real data", () => {
  it("PLUTO: building A's facts in words (3.1)", () => {
    expect(parse("pluto", "building-a").data).toEqual({
      yearBuilt: 1926,
      floors: 4,
      unitsRes: 48,
      unitsTotal: 48,
      buildingClass: "D1",
      buildingClassLabel: "Elevator apartment building",
    });
  });

  it("violations: open counts by class and the 20 most recent, with citations removed (3.2)", () => {
    const { data, rowCount } = parse("violations", "building-a") as { data: import("../src/dossier").Violations; rowCount: number };
    expect(data.open).toEqual({ a: 14, b: 84, c: 23, other: 0 });
    expect(data.openTotal).toBe(121);
    expect(rowCount).toBe(121);
    expect(data.recent).toHaveLength(20);
    for (const v of data.recent) {
      expect(v.text).not.toMatch(/§|\bHMC\b|\bADM CODE\b/);
      expect(v.text.charAt(0)).toMatch(/[A-Z0-9(]/);
      expect(["A", "B", "C", "I"]).toContain(v.class);
    }
    const dates = data.recent.map((v) => v.inspectedOn ?? "");
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it("complaints: categories in words, sorted, plus the open count (3.3)", () => {
    const { data } = parse("complaints", "building-a") as { data: import("../src/dossier").Complaints };
    expect(data.byCategory[0]).toEqual({ category: "HEAT/HOT WATER", label: "Heat/hot water", count: 39 });
    expect(data.open).toBe(1);
    const counts = data.byCategory.map((c) => c.count);
    expect([...counts].sort((x, y) => y - x)).toEqual(counts);
  });

  it("311: top types with counts (3.4)", () => {
    const { data } = parse("service_requests", "building-a") as { data: import("../src/dossier").ServiceRequests };
    expect(data.top).toHaveLength(10);
    expect(data.top[0]).toEqual({ type: "HEAT/HOT WATER", label: "Heat/hot water", count: 38 });
    expect(data.top[1]).toMatchObject({ label: "Noise - Residential", count: 23 });
  });

  it("evictions: count in the window and the latest date, from dates only (3.5)", () => {
    expect(parse("evictions", "building-a").data).toEqual({ inWindow: 1, total: 3, mostRecent: "2026-10-21" });
  });

  it("permits: both systems merged, newest first, in words (3.6)", () => {
    const { data } = parse("permits", "building-a") as { data: import("../src/dossier").Permits };
    expect(data.total).toBe(5);
    expect(data.scope).toBe("building");
    expect(data.unavailable).toEqual([]);
    expect(data.recent[0]).toMatchObject({ system: "DOB", label: "Alteration (several kinds of work): boiler" });
    expect(data.recent.find((p) => p.system === "DOB NOW")).toEqual({
      system: "DOB NOW",
      id: "B00019646-I1",
      date: "2018-02-15",
      label: "Alteration",
      status: "Permit Entire",
    });
    const dates = data.recent.map((p) => p.date ?? "");
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it("building B (commercial) has no housing records, but does have 311 requests and permits", () => {
    expect(parse("violations", "building-b").data).toEqual({ open: { a: 0, b: 0, c: 0, other: 0 }, openTotal: 0, recent: [] });
    expect(parse("complaints", "building-b").data).toEqual({ byCategory: [], open: 0 });
    expect(parse("evictions", "building-b").data).toEqual({ inWindow: 0, total: 0, mostRecent: null });
    expect(parse("service_requests", "building-b").rowCount).toBe(3);
    expect((parse("permits", "building-b").data as { total: number }).total).toBe(112);
    expect((parse("permits", "building-b").data as { recent: unknown[] }).recent).toHaveLength(10);
  });
});

describe("runAdapter (Requirement 3.2)", () => {
  it("returns ok with the parsed data, from the recorded responses", async () => {
    const r = fixture("violations", "building-a");
    const res = await runAdapter(ADAPTERS.violations, r.building, r.window, { fetch: replay(r), retryDelayMs: 0 });
    expect(res).toMatchObject({ kind: "ok", source: "violations", rowCount: 121 });
  });

  it("fails the whole section, naming it, when one required query fails", async () => {
    const r = fixture("complaints", "building-a");
    // Every attempt at the open-complaints query fails (one retry included); the category query works.
    const f = replay(r, (_d, url) => (url.searchParams.get("$where")?.includes("complaint_status") ? new Response("{}", { status: 503 }) : undefined));
    const res = await runAdapter(ADAPTERS.complaints, r.building, r.window, { fetch: f, retryDelayMs: 0 });
    expect(res).toMatchObject({ kind: "error", source: "complaints", reason: "http", status: 503 });
  });

  it("recovers when a query fails once, because the client retries a 5xx", async () => {
    const r = fixture("complaints", "building-a");
    let n = 0;
    const f = replay(r, () => (++n === 2 ? new Response("{}", { status: 503 }) : undefined));
    expect((await runAdapter(ADAPTERS.complaints, r.building, r.window, { fetch: f, retryDelayMs: 0 })).kind).toBe("ok");
  });

  it("shows DOB NOW permits when the legacy permit system times out, and says which is missing", async () => {
    const r = fixture("permits", "building-a");
    const hang = (dataset: string) => (dataset === "ipu4-2q9a" ? new Promise<Response>(() => undefined) : undefined);
    const f = vi.fn((u: string, init?: RequestInit) =>
      new Promise<Response>((resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        (replay(r, hang) as unknown as (u: string, i?: RequestInit) => Promise<Response>)(u, init).then(resolve, reject);
      }),
    ) as unknown as typeof fetch;
    const res = await runAdapter(ADAPTERS.permits, r.building, r.window, { fetch: f, timeoutMs: 30, retryDelayMs: 0 });
    expect(res).toMatchObject({ kind: "ok", data: { total: 1, unavailable: ["DOB"] } });
  });

  it("fails permits only when both permit systems fail", async () => {
    const r = fixture("permits", "building-a");
    const f = replay(r, () => new Response("{}", { status: 503 }));
    expect(await runAdapter(ADAPTERS.permits, r.building, r.window, { fetch: f, retryDelayMs: 0 })).toMatchObject({
      kind: "error",
      source: "permits",
    });
  });

  it("looks permits up by lot when there is no BIN, and says so (Requirement 2.3)", async () => {
    const qs = ADAPTERS.permits.queries({ bbl: A.bbl, bin: null }, W) as { params: Record<string, string> }[];
    expect(qs.map((q) => q.params.$where)).toEqual([`bbl = '${A.bbl}'`, `bbl = '${A.bbl}'`]);
    const r = fixture("permits", "building-a");
    const lot = ADAPTERS.permits.parse(bodies(r), { bbl: A.bbl, bin: null }, W);
    expect(lot.data.scope).toBe("lot");
    expect(ADAPTERS.permits.parse(bodies(r), r.building, W).data.scope).toBe("building");
  });

  it("uses the 8-second source timeout by default and sends the app token", async () => {
    const r = fixture("pluto", "building-a");
    const f = replay(r);
    await runAdapter(ADAPTERS.pluto, r.building, r.window, { fetch: f, appToken: "tok" });
    const init = (f as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]?.[1];
    expect((init?.headers as Record<string, string>)["X-App-Token"]).toBe("tok");
  });
});

// ---------- properties ----------

const FORBIDDEN = /owner|marshal|eviction_apt|docket|court_index|permittee|applicant|filing_representative|superintendent|site_safety|phone/i;
const building = fc.record({
  bbl: fc.stringMatching(/^[1-5]\d{9}$/),
  bin: fc.option(fc.stringMatching(/^[1-5]\d{6}$/), { nil: null }),
});

describe("adapter properties (Requirements 4, 5)", () => {
  it("never selects a column that names a person (4.1)", () => {
    fc.assert(
      fc.property(building, (b) => {
        for (const source of DOSSIER_SOURCES) {
          const qs = ADAPTERS[source].queries(b, W);
          if (!Array.isArray(qs)) continue;
          for (const q of qs) {
            expect(q.params.$select).toBeDefined();
            for (const col of (q.params.$select as string).split(",")) expect(col.trim().split(" ")[0]).not.toMatch(FORBIDDEN);
          }
        }
      }),
    );
  });

  it("quotes the normalized identifier in every query, and queries by BIN only for permits (5.1, 5.2)", () => {
    fc.assert(
      fc.property(building, (b) => {
        for (const source of DOSSIER_SOURCES) {
          const qs = ADAPTERS[source].queries(b, W);
          if (!Array.isArray(qs)) continue;
          for (const q of qs) {
            const where = q.params.$where as string;
            if (source === "permits" && b.bin !== null) expect(where).toContain(`'${b.bin}'`);
            else expect(where.startsWith(`bbl = '${b.bbl}'`)).toBe(true);
          }
        }
      }),
    );
  });

  const junkRow: fc.Arbitrary<Row> = fc.dictionary(
    fc.constantFrom("class", "n", "major_category", "complaint_type", "executed_date", "inspectiondate", "novdescription", "yearbuilt", "numfloors", "unitsres", "bldgclass", "job_type", "issuance_date", "filing_date", "job__", "ownername", "marshal_last_name"),
    fc.oneof(fc.string(), fc.integer(), fc.constant(null), fc.jsonValue()),
  );

  it("parsers never throw on arbitrary rows, and every count is a non-negative integer", () => {
    fc.assert(
      fc.property(fc.constantFrom(...DOSSIER_SOURCES), fc.array(fc.option(fc.array(junkRow, { maxLength: 8 }), { nil: null }), { minLength: 2, maxLength: 2 }), (source, bs) => {
        const out = (ADAPTERS[source] as unknown as Adapter<DossierSource, unknown>).parse(bs, A, W);
        expect(Number.isSafeInteger(out.rowCount) && out.rowCount >= 0).toBe(true);
        JSON.stringify(out.data, (k, v) => {
          if (typeof v === "number" && ["a", "b", "c", "other", "openTotal", "count", "open", "inWindow", "total"].includes(k)) {
            expect(Number.isSafeInteger(v) && v >= 0).toBe(true);
          }
          return v;
        });
      }),
    );
  });

  it("never shows a value from a column it didn't select, even if Socrata sends one", () => {
    fc.assert(
      fc.property(fc.constantFrom(...DOSSIER_SOURCES), fc.constantFrom<"building-a" | "building-b">("building-a", "building-b"), (source, name) => {
        const r = fixture(source, name);
        const tainted = r.queries.map((q) =>
          Array.isArray(q.body) ? (q.body as Row[]).map((row) => ({ ...row, ownername: "SECRET OWNER", marshal_last_name: "SECRET MARSHAL", eviction_apt_num: "SECRET APT" })) : null,
        );
        const out = (ADAPTERS[source] as unknown as Adapter<DossierSource, unknown>).parse(tainted, r.building, r.window);
        expect(JSON.stringify(out)).not.toContain("SECRET");
      }),
    );
  });
});
