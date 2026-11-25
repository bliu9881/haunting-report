import { describe, expect, it, vi } from "vitest";
import fc from "fast-check";
import { datasetAsOf, socrataPages, socrataQuery, socrataQueryAll, soqlString } from "../src/socrata";

type Handler = (url: URL, init?: RequestInit) => Response | Promise<Response>;

function fakeFetch(handler: Handler) {
  return vi.fn(async (u: string, init?: RequestInit) => handler(new URL(u), init)) as unknown as typeof fetch & {
    mock: { calls: [string, RequestInit?][] };
  };
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const fast = { retryDelayMs: 0 };

describe("soqlString", () => {
  it("doubles single quotes", () => {
    expect(soqlString("STATEN ISLAND")).toBe("'STATEN ISLAND'");
    expect(soqlString("O'Brien")).toBe("'O''Brien'");
  });

  it("always yields one well-formed literal", () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const lit = soqlString(s);
        expect(lit.startsWith("'") && lit.endsWith("'")).toBe(true);
        // Inside the quotes, every quote is part of a doubled pair.
        expect(lit.slice(1, -1).replace(/''/g, "")).not.toContain("'");
      }),
    );
  });
});

describe("socrataQuery", () => {
  it("builds the resource URL and sends the app token", async () => {
    const f = fakeFetch(() => json([{ bbl: "3013610043" }]));
    const r = await socrataQuery("wvxf-dwi5", { $where: "bbl='3013610043'" }, "violations", { fetch: f, appToken: "tok", ...fast });
    expect(r).toEqual({ kind: "ok", data: [{ bbl: "3013610043" }] });
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(new URL(url).pathname).toBe("/resource/wvxf-dwi5.json");
    expect(new URL(url).searchParams.get("$where")).toBe("bbl='3013610043'");
    expect((init.headers as Record<string, string>)["X-App-Token"]).toBe("tok");
  });

  it("sends no token header when there is no token", async () => {
    const f = fakeFetch(() => json([]));
    await socrataQuery("wvxf-dwi5", {}, "violations", { fetch: f, ...fast });
    expect((f.mock.calls[0] as [string, RequestInit])[1].headers).toBeUndefined();
  });

  it("rejects dataset ids that are not four-four, before any request", async () => {
    const f = fakeFetch(() => json([]));
    await expect(socrataQuery("../admin", {}, "x", { fetch: f })).rejects.toThrow(TypeError);
    expect(f).not.toHaveBeenCalled();
  });

  it("names the source in errors, with the HTTP status", async () => {
    const r = await socrataQuery("wvxf-dwi5", {}, "violations", { fetch: fakeFetch(() => json({ message: "bad query" }, 400)), ...fast });
    expect(r).toEqual({ kind: "error", source: "violations", reason: "http", status: 400, message: "HTTP 400" });
  });

  it("treats Socrata's error object as malformed, not as rows", async () => {
    const r = await socrataQuery("wvxf-dwi5", {}, "violations", { fetch: fakeFetch(() => json({ error: true })), ...fast });
    expect(r).toMatchObject({ kind: "error", reason: "malformed" });
  });
});

describe("socrataQueryAll", () => {
  it("errors when the result fills the limit, since it may be truncated", async () => {
    const f = fakeFetch(() => json([{ n: "1" }, { n: "2" }]));
    expect(await socrataQueryAll("wvxf-dwi5", {}, "violations", { fetch: f, limit: 2, ...fast })).toMatchObject({
      kind: "error",
      reason: "malformed",
    });
    expect(await socrataQueryAll("wvxf-dwi5", {}, "violations", { fetch: f, limit: 3, ...fast })).toMatchObject({ kind: "ok" });
  });
});

describe("socrataPages", () => {
  const table = Array.from({ length: 7 }, (_, i) => ({ id: String(i) }));
  const paged = () =>
    fakeFetch((url) => {
      const limit = Number(url.searchParams.get("$limit"));
      const offset = Number(url.searchParams.get("$offset"));
      return json(table.slice(offset, offset + limit));
    });

  it("collects every page and stops at the first short page", async () => {
    const f = paged();
    const r = await socrataPages("64uk-42ks", { $order: "bbl" }, "pluto", { fetch: f, pageSize: 3, ...fast });
    expect(r).toEqual({ kind: "ok", data: table });
    expect(f).toHaveBeenCalledTimes(3);
  });

  it("asks once more when the last page is exactly full", async () => {
    const f = paged();
    const r = await socrataPages("64uk-42ks", { $order: "bbl" }, "pluto", { fetch: f, pageSize: 7, ...fast });
    expect(r).toEqual({ kind: "ok", data: table });
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("fails the whole pull if any page fails", async () => {
    let n = 0;
    const f = fakeFetch(() => (++n === 2 ? json({}, 400) : json([{ id: "x" }, { id: "y" }])));
    expect(await socrataPages("64uk-42ks", { $order: "bbl" }, "pluto", { fetch: f, pageSize: 2, ...fast })).toMatchObject({
      kind: "error",
      source: "pluto",
    });
  });

  it("refuses to page without $order", async () => {
    await expect(socrataPages("64uk-42ks", {}, "pluto", { fetch: paged() })).rejects.toThrow(TypeError);
  });

  it("returns every row exactly once for any table and page size", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 0, max: 40 }), fc.integer({ min: 1, max: 12 }), async (rows, pageSize) => {
        const data = Array.from({ length: rows }, (_, i) => ({ id: String(i) }));
        const f = fakeFetch((url) => {
          const offset = Number(url.searchParams.get("$offset"));
          return json(data.slice(offset, offset + Number(url.searchParams.get("$limit"))));
        });
        expect(await socrataPages("64uk-42ks", { $order: "id" }, "pluto", { fetch: f, pageSize, ...fast })).toEqual({ kind: "ok", data });
      }),
    );
  });
});

describe("datasetAsOf", () => {
  it("converts rowsUpdatedAt seconds to an ISO instant", async () => {
    const f = fakeFetch((url) => {
      expect(url.pathname).toBe("/api/views/wvxf-dwi5.json");
      return json({ rowsUpdatedAt: 1795623168 });
    });
    expect(await datasetAsOf("wvxf-dwi5", "violations", { fetch: f, ...fast })).toEqual({
      kind: "ok",
      data: new Date(1795623168 * 1000).toISOString(),
    });
  });

  it("errors when rowsUpdatedAt is missing", async () => {
    expect(await datasetAsOf("wvxf-dwi5", "violations", { fetch: fakeFetch(() => json({})), ...fast })).toMatchObject({
      kind: "error",
      reason: "malformed",
    });
  });
});
