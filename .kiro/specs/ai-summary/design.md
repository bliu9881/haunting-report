# Design: AI Summary

Implements the approved decisions in requirements.md.

## Flow
```
<Dossier> (client) ── once violations, complaints and pluto have answered ──► GET /api/building/[bbl]/summary?bin=
   route handler
     ├─ loadSection × 6 (the same cache, so no extra Socrata calls) + lookupRanking
     ├─ buildFacts(...)              packages/core/src/summary/facts.ts     pure
     ├─ cache hit? return it         key: summary|bbl|bin|windowEnd|model
     ├─ rate limiter (20/min, 500/day)
     ├─ callGemini(facts)            packages/core/src/summary/gemini.ts   fetchJson, 15 s, structured output
     └─ checkSummary(output, facts)  packages/core/src/summary/check.ts     pure
```

## Pure parts (packages/core/src/summary/)
- `buildFacts`: turns section results into a compact JSON object keyed by section id, plus a `numbers` set of every number that appears in it (counts, years, ranks, percentages, the parts of dates). Apartment and story references are removed from violation texts (`APT 2I, 2nd STORY`).
- `checkSummary(raw, facts)`: parses the model's JSON and applies Requirement 1.3. Returns `{ sentences, dropped: { reason, text }[] }`. The dropped list is logged, so the prompt can be tuned from real failures.
- Property tests: a sentence whose numbers all come from `facts.numbers` and whose sources all loaded is kept; inserting any other number drops it; a sentence with no sources is dropped; the check never throws on arbitrary model output.

## Gemini call
`POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent` with header `x-goog-api-key`. `systemInstruction` states the rules; `generationConfig` sets `responseMimeType: application/json` and a `responseSchema` whose `sources` items are an enum of the section ids, so the model can't invent a section. A 402 or 429 is reported as `reason: "quota"`, so `/api/health` and the logs can tell a billing problem from an outage.

## UI
A panel above the ranking: title "The medium's reading" (display font), the surviving sentences, each with small source chips (`#section-violations` anchors), and the line "Written by AI from the records below and checked against them. Not legal advice." While loading: the candle and "The medium is reading the records…". If unavailable: one muted line, never an error box.
