import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/server";
import { buildingReport, findBuilding, neighborhoodMostHaunted, rankingsStatus } from "../src/tools";

const BASE = "https://site.test";
const geosearch = (name: string) =>
  JSON.parse(readFileSync(new URL(`../../../packages/core/test/fixtures/geosearch-${name}.json`, import.meta.url), "utf8"));

/** A fake of the site's API and of geosearch. `fail` lists paths that answer 503. */
function fakeFetch(fail: string[] = []) {
  return vi.fn(async (u: string) => {
    const url = new URL(u);
    if (url.hostname === "geosearch.planninglabs.nyc") {
      const text = url.searchParams.get("text") ?? "";
      return Response.json(geosearch(text.includes("88th St, New York") ? "new-york-ny" : text.includes("zzzz") ? "not-found" : "building-a"));
    }
    if (fail.some((f) => url.pathname.endsWith(f))) return Response.json({ kind: "error", reason: "http" }, { status: 503 });
    if (url.pathname === "/api/health") return Response.json({ status: "ok", rankings: { ok: true, runId: 8 } });
    if (url.pathname.endsWith("/ranking")) return Response.json({ kind: "ranked", building: { rank: 266, neighborhoodCount: 2955, ntaCode: "BK0802" } });
    if (url.pathname.endsWith("/summary")) return Response.json({ kind: "ok", sentences: [{ text: "Ranked 266 of 2955.", sources: ["ranking"] }] });
    if (url.pathname.startsWith("/api/neighborhood/ZZ")) return Response.json({ kind: "not_found" }, { status: 404 });
    if (url.pathname.startsWith("/api/neighborhood/")) return Response.json({ kind: "ok", neighborhood: { ntaCode: "BK0802", count: 2955 }, top: [] });
    const section = url.pathname.split("/").pop();
    return Response.json({ kind: "ok", source: section, data: {}, rowCount: 1, asOf: {} });
  }) as unknown as typeof fetch & { mock: { calls: [string][] } };
}

describe("tools", () => {
  it("find_building resolves with the site's address rules", async () => {
    const deps = { fetch: fakeFetch(), baseUrl: BASE };
    expect((await findBuilding(deps, { address: "1248 St Marks Avenue Brooklyn" })).result).toMatchObject({
      kind: "match",
      building: { bbl: "3013610043", bin: "3036097" },
    });
    expect((await findBuilding(deps, { address: "350 88th St, New York, NY" })).result).toMatchObject({ kind: "ambiguous", reason: "multiple_boroughs" });
    expect((await findBuilding(deps, { address: "zzzzqqqq xyzzy" })).result).toEqual({ kind: "not_found" });
    expect(await findBuilding(deps, { address: "   " })).toMatchObject({ isError: true, result: { kind: "invalid_input" } });
  });

  it("building_report fetches the ranking and all six sections, validated and with the BIN", async () => {
    const f = fakeFetch();
    const out = await buildingReport({ fetch: f, baseUrl: BASE }, { bbl: "3013610043", bin: "3036097" });
    expect(out.isError).toBe(false);
    expect(Object.keys(out.result.sections as object)).toEqual(["pluto", "violations", "complaints", "service_requests", "evictions", "permits"]);
    expect(out.result.summary).toBeUndefined();
    const paths = f.mock.calls.map(([u]) => new URL(u).pathname + new URL(u).search).sort();
    expect(paths).toContain("/api/building/3013610043/ranking");
    expect(paths).toContain("/api/building/3013610043/permits?bin=3036097");
    expect(paths).toHaveLength(7);
  });

  it("building_report marks one failed section unavailable and still succeeds", async () => {
    const out = await buildingReport({ fetch: fakeFetch(["/complaints"]), baseUrl: BASE }, { bbl: "3013610043", include_summary: true });
    expect(out.isError).toBe(false);
    expect((out.result.sections as Record<string, unknown>).complaints).toEqual({ kind: "unavailable", reason: "http 503" });
    expect(out.result.summary).toMatchObject({ kind: "ok" });
  });

  it("building_report fails as a whole only when nothing came back", async () => {
    const all = ["/ranking", "/pluto", "/violations", "/complaints", "/service_requests", "/evictions", "/permits"];
    expect((await buildingReport({ fetch: fakeFetch(all), baseUrl: BASE }, { bbl: "3013610043" })).isError).toBe(true);
  });

  it("rejects bad identifiers before any request", async () => {
    const f = fakeFetch();
    expect(await buildingReport({ fetch: f, baseUrl: BASE }, { bbl: "../admin" })).toMatchObject({ isError: true, result: { kind: "invalid_input" } });
    expect(await buildingReport({ fetch: f, baseUrl: BASE }, { bbl: "3013610043", bin: "9999999" })).toMatchObject({ isError: true });
    expect(await neighborhoodMostHaunted({ fetch: f, baseUrl: BASE }, { nta_code: "BK08; drop" })).toMatchObject({ isError: true });
    expect(await neighborhoodMostHaunted({ fetch: f, baseUrl: BASE }, { nta_code: "BK0802", limit: 51 })).toMatchObject({ isError: true });
    expect(f).not.toHaveBeenCalled();
  });

  it("neighborhood_most_haunted accepts lower case, and reports an unknown code as not found", async () => {
    const deps = { fetch: fakeFetch(), baseUrl: BASE };
    expect((await neighborhoodMostHaunted(deps, { nta_code: "bk0802", limit: 5 })).result).toMatchObject({ kind: "ok", pageUrl: `${BASE}/neighborhood/BK0802` });
    expect(await neighborhoodMostHaunted(deps, { nta_code: "ZZ9999" })).toEqual({ result: { kind: "not_found", nta_code: "ZZ9999" }, isError: false });
  });

  it("rankings_status reports the live run", async () => {
    expect((await rankingsStatus({ fetch: fakeFetch(), baseUrl: BASE })).result).toMatchObject({ status: "ok", rankings: { runId: 8 } });
  });
});

describe("MCP server over a transport", () => {
  async function connect() {
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await createServer({ fetch: fakeFetch(), baseUrl: BASE }).connect(serverSide);
    const client = new Client({ name: "test", version: "0" });
    await client.connect(clientSide);
    return client;
  }

  it("lists four read-only tools with input schemas", async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(["building_report", "find_building", "neighborhood_most_haunted", "rankings_status"]);
    for (const t of tools) expect(t.annotations?.readOnlyHint).toBe(true);
    expect(tools.find((t) => t.name === "find_building")?.inputSchema.required).toEqual(["address"]);
  });

  it("returns structured content and the same result as text", async () => {
    const client = await connect();
    const r = await client.callTool({ name: "find_building", arguments: { address: "1248 St Marks Avenue Brooklyn" } });
    expect(r.isError).toBe(false);
    expect(r.structuredContent).toMatchObject({ kind: "match", building: { bbl: "3013610043" } });
    expect(JSON.parse((r.content as { text: string }[])[0]!.text)).toEqual(r.structuredContent);
  });

  it("rejects arguments that break the schema", async () => {
    const client = await connect();
    const r = await client.callTool({ name: "neighborhood_most_haunted", arguments: { nta_code: "BK0802", limit: 500 } });
    expect(r.isError).toBe(true);
  });
});
