import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import fc from "fast-check";
import { classify, parseQuery, resolveAddress, type Candidate, type ParsedQuery } from "../src/geosearch";
import { boroughCode } from "../src/identifiers";
import { streetMatches } from "../src/street";

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`./fixtures/geosearch-${name}.json`, import.meta.url), "utf8"));

function fetchReturning(body: unknown, status = 200) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
}

/** A fetch that never answers, and rejects when its signal aborts, like the real one. */
function hangingFetch() {
  return vi.fn(
    (_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      }),
  ) as unknown as typeof fetch;
}

describe("resolveAddress with recorded fixtures", () => {
  it("matches building A and dedupes its four spelling aliases (Req 1.1, 1.6)", async () => {
    const r = await resolveAddress("1248 St Marks Avenue Brooklyn", { fetch: fetchReturning(fixture("building-a")) });
    expect(r).toMatchObject({ kind: "match", building: { bbl: "3013610043", bin: "3036097", borough: "Brooklyn" } });
  });

  it("matches building B when the borough is given, even though candidates span boroughs", async () => {
    const r = await resolveAddress("350 E 88th St Manhattan", { fetch: fetchReturning(fixture("building-b")) });
    expect(r).toMatchObject({ kind: "match", building: { bbl: "1015500031", bin: "1050055" } });
  });

  it("asks the user when there is no house number (Req 1.3a)", async () => {
    const r = await resolveAddress("Broadway", { fetch: fetchReturning(fixture("no-housenumber")) });
    expect(r).toMatchObject({ kind: "ambiguous", reason: "no_housenumber" });
  });

  it("asks the user when no borough is given and candidates span boroughs (Req 1.3b)", async () => {
    const r = await resolveAddress("350 88th St", { fetch: fetchReturning(fixture("no-borough")) });
    expect(r.kind).toBe("ambiguous");
    if (r.kind === "ambiguous") {
      expect(r.reason).toBe("multiple_boroughs");
      expect(new Set(r.candidates.map((c) => c.borough)).size).toBeGreaterThan(1);
    }
  });

  it("returns not_found for zero features (Req 1.2)", async () => {
    const r = await resolveAddress("zzzzqqqq xyzzy", { fetch: fetchReturning(fixture("not-found")) });
    expect(r).toEqual({ kind: "not_found" });
  });

  it("does not call geosearch for blank input (Req 1.5)", async () => {
    const f = fetchReturning({});
    expect(await resolveAddress("   ", { fetch: f })).toEqual({ kind: "not_found" });
    expect(f).not.toHaveBeenCalled();
  });
});

describe("address checks: queries the day-1 rules matched to the wrong building (Req 1.8 to 1.11)", () => {
  it('treats "New York, NY" as no borough, so candidates in three boroughs are ambiguous (Req 1.9)', async () => {
    const r = await resolveAddress("350 88th St, New York, NY", { fetch: fetchReturning(fixture("new-york-ny")) });
    expect(r).toMatchObject({ kind: "ambiguous", reason: "multiple_boroughs" });
  });

  it("drops candidates whose house number differs, leaving nothing (Req 1.8, 1.10)", async () => {
    const r = await resolveAddress("100 Main St, New York, NY", { fetch: fetchReturning(fixture("wrong-housenumber")) });
    expect(r).toEqual({ kind: "not_found" });
  });

  it("drops other boroughs, then refuses to match a different street (Req 1.9, 1.11)", async () => {
    const r = await resolveAddress("123 Fake Street Queens", { fetch: fetchReturning(fixture("fake-street")) });
    expect(r.kind).toBe("ambiguous");
    if (r.kind === "ambiguous") {
      expect(r.reason).toBe("street_mismatch");
      expect(r.candidates.every((c) => c.borough === "Queens")).toBe(true);
    }
  });

  it("uses the postcode as the place and the house number to pick one building (Req 1.8, 1.9)", async () => {
    const r = await resolveAddress("350 88th St, NY 10128", { fetch: fetchReturning(fixture("postcode")) });
    expect(r).toMatchObject({ kind: "match", building: { bbl: "1015500031", housenumber: "350", postcode: "10128" } });
  });
});

describe("resolveAddress failures (Req 1.4, 5)", () => {
  const fast = { retryDelayMs: 0 };

  it("reports a 4xx with its status, without retrying (5.4, 5.5)", async () => {
    const f = fetchReturning({}, 404);
    const r = await resolveAddress("1 Main St", { fetch: f, ...fast });
    expect(r).toEqual({ kind: "error", source: "geosearch", reason: "http", status: 404, message: "HTTP 404" });
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("retries a 5xx once, then reports it (5.4)", async () => {
    const f = fetchReturning({}, 503);
    const r = await resolveAddress("1 Main St", { fetch: f, ...fast });
    expect(r).toMatchObject({ kind: "error", reason: "http", status: 503 });
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("recovers when the retry succeeds", async () => {
    let calls = 0;
    const f = vi.fn(async () => {
      calls++;
      if (calls === 1) throw new TypeError("fetch failed");
      return new Response(JSON.stringify(fixture("building-a")));
    }) as unknown as typeof fetch;
    expect(await resolveAddress("1248 St Marks Avenue Brooklyn", { fetch: f, ...fast })).toMatchObject({ kind: "match" });
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("reports a network error after one retry", async () => {
    const f = vi.fn(async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    expect(await resolveAddress("1 Main St", { fetch: f, ...fast })).toEqual({
      kind: "error",
      source: "geosearch",
      reason: "network",
      message: "fetch failed",
    });
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("times out a hung request, without retrying (5.2, 5.4)", async () => {
    const f = hangingFetch();
    const t = performance.now();
    const r = await resolveAddress("1 Main St", { fetch: f, timeoutMs: 30, ...fast });
    expect(r).toMatchObject({ kind: "error", source: "geosearch", reason: "timeout" });
    expect(f).toHaveBeenCalledTimes(1);
    expect(performance.now() - t).toBeLessThan(1000);
  });

  it("returns an error, not a throw, when the caller aborts (5.3)", async () => {
    const f = hangingFetch();
    const controller = new AbortController();
    const pending = resolveAddress("1 Main St", { fetch: f, signal: controller.signal, ...fast });
    controller.abort();
    expect(await pending).toMatchObject({ kind: "error", source: "geosearch", reason: "aborted" });
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("reports a body that is not JSON as malformed", async () => {
    const f = vi.fn(async () => new Response("<html>oops</html>")) as unknown as typeof fetch;
    expect(await resolveAddress("1 Main St", { fetch: f, ...fast })).toMatchObject({ kind: "error", reason: "malformed" });
  });

  it("reports JSON that is not a feature collection as malformed", async () => {
    expect(await resolveAddress("1 Main St", { fetch: fetchReturning({ error: "x" }), ...fast })).toMatchObject({
      kind: "error",
      reason: "malformed",
    });
  });

  it("never throws and never matches an invalid BBL, whatever JSON comes back", async () => {
    await fc.assert(
      fc.asyncProperty(fc.jsonValue(), async (body) => {
        const r = await resolveAddress("1 Main St", { fetch: fetchReturning(body) });
        if (r.kind === "match") expect(r.building.bbl).toMatch(/^[1-5]\d{9}$/);
      }),
    );
  });
});

const BOROUGHS = ["Manhattan", "Bronx", "Brooklyn", "Queens", "Staten Island"] as const;
const HOUSENUMBERS = ["12", "350", "37-10"] as const;
const POSTCODES = ["10128", "11209", "11213"] as const;
const CANDIDATE_STREETS = ["EAST 88 STREET", "WEST 88 STREET", "BROADWAY", "MAIN STREET"] as const;
const QUERY_STREETS = ["88th St", "E 88th St", "Broadway", "Main St", "Fake St"] as const;

const candidateArb: fc.Arbitrary<Candidate> = fc.record({
  bbl: fc.stringMatching(/^[1-5]\d{9}$/),
  bin: fc.option(fc.stringMatching(/^[1-5]\d{6}$/), { nil: null }),
  label: fc.string(),
  borough: fc.constantFrom(...BOROUGHS),
  confidence: fc.double({ min: 0, max: 1, noNaN: true }),
  housenumber: fc.option(fc.constantFrom(...HOUSENUMBERS), { nil: null }),
  street: fc.option(fc.constantFrom(...CANDIDATE_STREETS), { nil: null }),
  postcode: fc.option(fc.constantFrom(...POSTCODES), { nil: null }),
});
const queryArb: fc.Arbitrary<ParsedQuery> = fc.record({
  housenumber: fc.option(fc.constantFrom(...HOUSENUMBERS), { nil: null }),
  street: fc.option(fc.constantFrom(...QUERY_STREETS), { nil: null }),
  borough: fc.option(fc.constantFrom("1", "2", "3", "4", "5"), { nil: null }),
  postcode: fc.option(fc.constantFrom(...POSTCODES), { nil: null }),
});
const candidatesArb = fc.array(candidateArb, { maxLength: 6 });

function isSubsequence<T>(sub: T[], all: T[]): boolean {
  let i = 0;
  for (const x of all) if (x === sub[i]) i++;
  return i === sub.length;
}

describe("classify properties (Req 1)", () => {
  it("a match never contradicts the query's house number, borough, postcode or street (Req 1.8, 1.9, 1.11)", () => {
    fc.assert(
      fc.property(queryArb, candidatesArb, (q, cs) => {
        const r = classify(q, cs);
        if (r.kind !== "match") return;
        const b = r.building;
        if (q.housenumber !== null && b.housenumber !== null) expect(b.housenumber).toBe(q.housenumber);
        if (q.borough !== null) expect(boroughCode(b.borough)).toBe(q.borough);
        if (q.postcode !== null && b.postcode !== null) expect(b.postcode).toBe(q.postcode);
        if (q.street !== null && b.street !== null) expect(streetMatches(q.street, b.street)).toBe(true);
      }),
    );
  });

  it("only removes candidates, never adds or re-orders them (Req 1.7)", () => {
    fc.assert(
      fc.property(queryArb, candidatesArb, (q, cs) => {
        const r = classify(q, cs);
        if (r.kind === "match") expect(cs).toContain(r.building);
        if (r.kind === "ambiguous") {
          expect(r.candidates.length).toBeGreaterThan(0);
          expect(isSubsequence(r.candidates, cs)).toBe(true);
        }
        if (cs.length === 0) expect(r.kind).toBe("not_found");
      }),
    );
  });

  it("a match is the first surviving candidate: anything earlier in geosearch's order disagrees with the query (Req 1.7)", () => {
    fc.assert(
      fc.property(queryArb, candidatesArb, (q, cs) => {
        const r = classify(q, cs);
        if (r.kind !== "match") return;
        for (const earlier of cs.slice(0, cs.indexOf(r.building))) {
          expect(classify(q, [earlier]).kind).not.toBe("match");
        }
      }),
    );
  });

  it("never silently picks between the same address in two boroughs when the query names no place (Req 1.3b, 1.9)", () => {
    fc.assert(
      fc.property(candidateArb, fc.constantFrom(...BOROUGHS), fc.boolean(), (c, otherBorough, twinFirst) => {
        fc.pre(otherBorough !== c.borough && c.housenumber !== null);
        const twin: Candidate = { ...c, borough: otherBorough, bbl: c.bbl === "1000010001" ? "2000010001" : "1000010001" };
        const q: ParsedQuery = { housenumber: c.housenumber, street: c.street, borough: null, postcode: null };
        const cs = twinFirst ? [twin, c] : [c, twin];
        expect(classify(q, cs)).toMatchObject({ kind: "ambiguous", reason: "multiple_boroughs" });
      }),
    );
  });

  it("a confident candidate queried by its own address is always a match", () => {
    fc.assert(
      fc.property(candidateArb, (c) => {
        fc.pre(c.confidence >= 0.6);
        const q: ParsedQuery = { housenumber: c.housenumber, street: c.street, borough: boroughCode(c.borough), postcode: c.postcode };
        expect(classify(q, [c])).toEqual({ kind: "match", building: c });
      }),
    );
  });
});

describe("parseQuery (Req 1.9)", () => {
  const body = (parsed: Record<string, string>) => ({ geocoding: { query: { parsed_text: parsed } }, features: [] });

  it.each(["New York", "NY", "nyc", "New York City"])("treats %s as the city, not a borough", (locality) => {
    expect(parseQuery(body({ locality })).borough).toBeNull();
  });

  it.each([
    ["Manhattan", "1"],
    ["The Bronx", "2"],
    ["brooklyn", "3"],
    ["Staten  Island", "5"],
  ])("reads %s as borough %s", (locality, code) => {
    expect(parseQuery(body({ locality })).borough).toBe(code);
  });

  it("keeps a five-digit postcode and ignores the ZIP+4 suffix", () => {
    expect(parseQuery(body({ postcode: "10128-1234" })).postcode).toBe("10128");
  });
});
