import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import fc from "fast-check";
import { ADAPTERS, type Adapter, type DossierSource } from "../src/dossier";
import type { Row } from "../src/socrata";
import {
  buildFacts,
  callGemini,
  checkSummary,
  numbersIn,
  RESPONSE_SCHEMA,
  stripUnitReferences,
  SUMMARY_SECTIONS,
  type Facts,
  type SummaryInput,
} from "../src/summary";

const W = { start: "2023-11-25", end: "2026-11-25" };

function section<S extends DossierSource>(source: S): unknown {
  const r = JSON.parse(readFileSync(new URL(`./fixtures/dossier-${source}-building-a.json`, import.meta.url), "utf8"));
  return (ADAPTERS[source] as unknown as Adapter<S, unknown>).parse(
    r.queries.map((q: { body: unknown }) => q.body as Row[]),
    r.building,
    r.window,
  ).data;
}

/** Building A, from recorded city responses plus its live ranking. */
function buildingA(): SummaryInput {
  return {
    address: "1248 Saint Mark's Avenue, Brooklyn",
    window: W,
    ranking: {
      ranked: true,
      rank: 266,
      buildingsInNeighborhood: 2955,
      neighborhood: "Crown Heights (North)",
      moreHauntedThanPercent: 90,
      score: 9.5,
      neighborhoodMedianScore: 0.75,
    },
    pluto: section("pluto") as SummaryInput["pluto"],
    violations: section("violations") as SummaryInput["violations"],
    complaints: section("complaints") as SummaryInput["complaints"],
    service_requests: section("service_requests") as SummaryInput["service_requests"],
    evictions: section("evictions") as SummaryInput["evictions"],
    permits: section("permits") as SummaryInput["permits"],
  };
}

describe("stripUnitReferences (Requirement 2.2)", () => {
  it.each([
    [
      "Abate the infestation consisting of mice in the entire apartment located at apt 2I, 2nd story, 1st apartment from north at east",
      "Abate the infestation consisting of mice in the entire apartment",
    ],
    [
      "Properly repair the broken or defective caulking around bathtub in the bathroom located at apt 2I, 2nd story, 1st apartment from north at east",
      "Properly repair the broken or defective caulking around bathtub in the bathroom",
    ],
    ["Replace or repair the self-closing doors at exit door, south wall, at public hall, 1st story", "Replace or repair the self-closing doors at exit door, south wall, at public hall"],
    ["Provide heat", "Provide heat"],
  ])("%s", (input, expected) => {
    expect(stripUnitReferences(input)).toBe(expected);
  });

  it("never leaves an apartment number behind", () => {
    const unit = fc.stringMatching(/^[1-9][0-9]?[A-K]?$/);
    fc.assert(
      fc.property(fc.constantFrom("Repair the door", "Abate mice in the kitchen"), unit, fc.integer({ min: 1, max: 30 }), (start, apt, story) => {
        const out = stripUnitReferences(`${start} located at apt ${apt}, ${story}th story, 1st apartment from north at east`);
        expect(out).not.toMatch(/\bapt\b/i);
        expect(out).toBe(start);
      }),
    );
  });
});

describe("buildFacts (Requirement 1.1)", () => {
  it("keeps 'open right now' and 'in the period' in separately named keys", () => {
    const { json } = buildFacts(buildingA());
    expect(json.complaints).toMatchObject({ openRightNow: 1, inPeriodByProblem: { "Heat/hot water": 39 } });
    expect((json.violations as { openRightNow: unknown }).openRightNow).toEqual({
      classC_immediatelyHazardous: 23,
      classB_hazardous: 84,
      classA_nonHazardous: 14,
    });
    expect((json.violations as { mostRecentOpen: unknown[] }).mostRecentOpen).toHaveLength(5);
  });

  it("sends no apartment numbers and nothing that names a person", () => {
    const text = JSON.stringify(buildFacts(buildingA()).json);
    expect(text).not.toMatch(/\bapt\b/i);
    expect(text).not.toMatch(/owner|marshal|docket/i);
  });

  it("collects every number it sends, including date parts and the period length", () => {
    const { numbers } = buildFacts(buildingA());
    for (const n of [266, 2955, 90, 9.5, 0.75, 1926, 48, 23, 84, 14, 39, 36, 2026, 10, 21]) expect(numbers.has(n)).toBe(true);
  });

  it("sends no open-violation total, so a model-made total fails the number check", () => {
    const f = buildFacts(buildingA());
    expect(f.numbers.has(121)).toBe(false);
    const r = checkSummary({ sentences: [{ text: "There are 121 open hazardous violations right now.", sources: ["violations"] }] }, f);
    expect(r.dropped[0]).toMatchObject({ reason: "unknown_number", detail: "121" });
  });

  it("lists only the sections it was given, and omits failed ones", () => {
    const input = buildingA();
    delete input.service_requests;
    delete input.ranking;
    const f = buildFacts(input);
    expect(f.loaded.has("service_requests")).toBe(false);
    expect(f.loaded.has("ranking")).toBe(false);
    expect(f.json.service_requests).toBeUndefined();
    expect(f.loaded.has("violations")).toBe(true);
  });
});

describe("numbersIn", () => {
  it("reads separators, decimals, ordinals, percents, dates and number words", () => {
    expect(numbersIn("ranked 266 of 2,955, more haunted than 90% of its neighbors")).toEqual([266, 2955, 90]);
    expect(numbersIn("score of 9.5 against a median of 0.75")).toEqual([9.5, 0.75]);
    expect(numbersIn("the 266th most haunted")).toEqual([266]);
    expect(numbersIn("on October 21, 2026")).toEqual([21, 2026]);
    expect(numbersIn("one eviction and twenty complaints")).toEqual([1, 20]);
  });
});

describe("checkSummary (Requirement 1.3, 1.4)", () => {
  const facts = () => buildFacts(buildingA());
  const s = (text: string, sources: string[] = ["violations"]) => ({ text, sources });

  it("keeps the faithful sentences from the first real test run", () => {
    const r = checkSummary(
      {
        sentences: [
          s("1248 Saint Mark's Avenue in Brooklyn has a ranking score of 9.5 and is ranked 266 out of 2955 in its neighborhood.", ["ranking"]),
          s("The building was constructed in 1926, has 4 floors, and contains 48 apartments.", ["pluto"]),
          s("There are 23 Class C, 84 Class B, and 14 Class A open violations."),
          s("There was 1 eviction in the last 36 months, most recently occurring on 2026-10-21.", ["evictions"]),
        ],
      },
      facts(),
    );
    expect(r.dropped).toEqual([]);
    expect(r.sentences).toHaveLength(4);
    expect(r.usable).toBe(true);
  });

  it("drops a sentence with a number that isn't in the records", () => {
    const r = checkSummary({ sentences: [s("There are 23 open class C violations."), s("There are 24 open class C violations.")] }, facts());
    expect(r.sentences.map((x) => x.text)).toEqual(["There are 23 open class C violations."]);
    expect(r.dropped[0]).toMatchObject({ reason: "unknown_number", detail: "24" });
    expect(r.usable).toBe(false);
  });

  it("drops sentences that cite nothing, or a section that didn't load", () => {
    const input = buildingA();
    delete input.service_requests;
    const r = checkSummary({ sentences: [s("Heat is the top problem.", []), s("Most 311 requests are about heat.", ["service_requests"])] }, buildFacts(input));
    expect(r.dropped.map((d) => d.reason)).toEqual(["no_sources", "source_not_loaded"]);
  });

  it.each([
    ["You should avoid this building because of its 23 class C violations.", "advice"],
    ["The heat complaints are probably caused by an old boiler.", "speculation"],
    ["With no open violations, the building is safe.", "safety_claim"],
    ["The building appears to be well kept.", "speculation"],
  ])("drops %s", (text, reason) => {
    expect(checkSummary({ sentences: [s(text)] }, facts()).dropped[0]?.reason).toBe(reason);
  });

  it("keeps at most five sentences", () => {
    const many = Array.from({ length: 7 }, () => s("There are 23 class C violations open right now."));
    expect(checkSummary({ sentences: many }, facts()).sentences).toHaveLength(5);
  });

  it("never throws, whatever the model returns", () => {
    fc.assert(
      fc.property(fc.jsonValue(), (raw) => {
        const r = checkSummary(raw, facts());
        expect(r.sentences.length).toBeLessThanOrEqual(5);
      }),
    );
  });

  it("a sentence using only known numbers and loaded sources is kept; adding an unknown number drops it", () => {
    const f: Facts = facts();
    const known = [...f.numbers].filter((n) => Number.isInteger(n) && n >= 0 && n < 100_000);
    fc.assert(
      fc.property(fc.subarray(known, { minLength: 1, maxLength: 3 }), fc.constantFrom(...SUMMARY_SECTIONS), fc.integer({ min: 100_000, max: 999_999 }), (ns, src, extra) => {
        const text = `The records list ${ns.join(" and ")} items.`;
        expect(checkSummary({ sentences: [{ text, sources: [src] }] }, f).sentences).toHaveLength(1);
        expect(checkSummary({ sentences: [{ text: `${text} Also ${extra}.`, sources: [src] }] }, f).sentences).toHaveLength(0);
      }),
    );
  });
});

describe("callGemini (Requirement 3)", () => {
  const okBody = (text: string) => ({ candidates: [{ content: { parts: [{ text: "thinking...", thought: true }, { text }] } }], usageMetadata: { totalTokenCount: 10 } });

  it("POSTs to the model with the key in a header, the schema, and no temperature", async () => {
    const f = vi.fn(async () => Response.json(okBody('{"sentences":[]}'))) as unknown as typeof fetch & { mock: { calls: [string, RequestInit][] } };
    const r = await callGemini(buildFacts(buildingA()), { apiKey: "AIza-test", fetch: f });
    expect(r).toMatchObject({ kind: "ok", raw: { sentences: [] }, model: "gemini-3.5-flash-lite" });
    const [url, init] = f.mock.calls[0]!;
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent");
    expect(url).not.toContain("AIza");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("AIza-test");
    const body = JSON.parse(init.body as string);
    expect(body.generationConfig).toEqual({ responseMimeType: "application/json", responseSchema: RESPONSE_SCHEMA });
    expect(JSON.stringify(body)).not.toContain("temperature");
  });

  it("ignores thinking parts and reports non-JSON answers as malformed", async () => {
    const f = vi.fn(async () => Response.json(okBody("not json"))) as unknown as typeof fetch;
    expect(await callGemini(buildFacts(buildingA()), { apiKey: "k", fetch: f })).toMatchObject({ kind: "error", reason: "malformed" });
  });

  it("reports billing and quota errors without retrying them", async () => {
    for (const status of [402, 403, 429]) {
      const f = vi.fn(async () => Response.json({ error: { status: "RESOURCE_EXHAUSTED" } }, { status }));
      const r = await callGemini(buildFacts(buildingA()), { apiKey: "k", fetch: f as unknown as typeof fetch, retryDelayMs: 0 });
      expect(r).toMatchObject({ kind: "error", source: "summary", reason: "http", status });
      expect(f).toHaveBeenCalledTimes(1);
    }
  });

  it("rejects an invalid model name before any request", async () => {
    const f = vi.fn() as unknown as typeof fetch;
    expect(await callGemini(buildFacts(buildingA()), { apiKey: "k", fetch: f, model: "../x?key=y" })).toMatchObject({ kind: "error", reason: "malformed" });
    expect(f).not.toHaveBeenCalled();
  });
});
