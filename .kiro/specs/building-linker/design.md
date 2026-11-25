# Design: Building Linker

Package: `packages/core`. Pure TypeScript, no framework. Tests use vitest and fast-check.

## Modules
- `src/identifiers.ts`: `boroughCode`, `normalizeBbl`, `composeBbl`, `parseBbl`, `normalizeBin`. Pure.
- `src/geosearch.ts`: `resolveAddress(text, opts)` returns the discriminated union below. Takes an injected `fetch`. Also holds the geosearch-specific types (`Candidate`, `ParsedQuery`, `ResolveResult`) and the pure `classify`.
- `src/street.ts`: `streetTokens`, `streetMatches`, `isBlankStreet` for the street check (Requirement 1.11). Pure.
- `src/types.ts`: types shared across modules: `BuildingId = { bbl: string; bin: string | null }`, `BblParts`, plus the shared record types added in later specs.
- `src/index.ts`: re-exports the public surface.

## Identifier rules (from docs/data-sources.md)
- Borough codes: MANHATTAN 1, BRONX 2, BROOKLYN 3, QUEENS 4, STATEN ISLAND 5. Case-insensitive. Digits `"1"` to `"5"` accepted. PLUTO's two-letter codes `MN`, `BX`, `BK`, `QN`, `SI` accepted, plus `STATEN IS` as an alias of `STATEN ISLAND`. Surrounding whitespace is trimmed and repeated inner spaces collapsed before lookup, so `"Staten  Island "` resolves.
- BBL = borough (1) + block (5, zero-padded) + lot (4, zero-padded). Block `00000` is rejected; lot `0000` is kept (DOF block-level records).
- `normalizeBbl` strips a fractional part of all zeros before validating, and rejects any other fractional part.
- BIN: 7 digits led by a borough digit 1 to 5. Placeholder BINs are exactly `[1-5]000000` and map to `null`. `0000000` and `9999999` are not BINs and also map to `null`.

Rationale for the leading-digit rule: `normalizeBbl` already enforces `^[1-5]` on the first digit, so leaving `normalizeBin` to accept any 7 digits made the two functions disagree about the same question, and let `9999999` through as a real BIN.

## Geosearch contract
`GET https://geosearch.planninglabs.nyc/v2/search?text=<q>&size=5`.

`size=5`, not the `size=1` recorded in docs/data-sources.md: Requirement 1.3 has to hand the user a choice when the address is ambiguous, which needs more than one candidate. That doc records the day-one probe; the query shape is this design's call.

Read `properties.addendum.pad.{bbl,bin}`, `.label`, `.borough`, `.confidence` per feature, and `geocoding.query.parsed_text` once per response.

Candidate pipeline (`parseCandidates`):
1. Drop features with no `pad.bbl`, or whose `pad.bbl` fails `normalizeBbl`.
2. Normalize `pad.bin` through `normalizeBin`. A placeholder becomes `null` and does not drop the candidate.
3. De-duplicate by (BBL, BIN). Geosearch returns one feature per street-name spelling, so building A arrives four times (`ST MARKS`, `SAINT MARK'S`, ...); without this step the user is asked to choose between four labels for one building. The first spelling is kept, which is why the street check has to treat `FELIX'S`, `FELIX` and `MARKS`, `MARK'S` as equal.
4. Keep each feature's `housenumber`, `street` and `postalcode` for the address checks.

`parseQuery` reads `parsed_text` into `{ housenumber, street, borough, postcode }`. `borough` is a code, taken from `parsed_text.borough` or `.locality` through `boroughCode`, after stripping a leading "The" and refusing city names (`New York`, `NY`, `NYC`, `New York City`). The refusal is explicit, not left to `boroughCode`, so adding county names to `boroughCode` for the evictions adapter cannot make "New York" mean Manhattan here. `postcode` keeps the first five digits.

### Why the decision compares the query with each candidate
Geosearch is Pelias, and `confidence` is useless here: **address queries return exactly `0.8` for every feature**, the correct match and the wrong-borough decoys alike. Exact landmark and postcode matches return `1`. A confidence threshold cannot separate anything, so the decision compares what the user typed with what each candidate is.

`classify(query, candidates)` runs in this order and never re-orders:
1. **Address checks** (Requirement 1.8, 1.9). Drop a candidate whose house number, borough or postcode contradicts the query. A candidate missing the field is kept. None left → `not_found` (1.10).
2. **Street check** (1.11). When the query has a non-blank street, keep candidates whose street matches. None match → `ambiguous` / `street_mismatch` with the step-1 survivors. The street check asks instead of returning `not_found` because its normalization is the fuzziest step: "Avenue of the Americas" is `6 AVENUE` in geosearch.
3. No house number and more than one distinct BBL → `ambiguous` / `no_housenumber`. "Broadway" cannot resolve to a building.
4. No place (no borough and no postcode) and more than one borough → `ambiguous` / `multiple_boroughs`. "350 88th St, New York, NY" matches in Brooklyn, Manhattan and Rockaway Beach.
5. Top candidate below `LOW_CONFIDENCE` (0.6) → `ambiguous` / `low_confidence`. A backstop; no probe has triggered it.
6. Otherwise → `match` on the top surviving candidate.

`classify` is pure and exported separately from the fetch, so the rules are property-testable without a network or a fixture.

### Street matching (`street.ts`)
Lower-case, strip apostrophes and periods, split on anything else that is not a letter or digit. Then per token: ordinals become digits (`88th` → `88`); `E`, `W`, `N`, `S` and the full words become directions; street-type words and `saint` are dropped (`st` is both Street and Saint); `bway` becomes `broadway`; a trailing `s` on alphabetic tokens of 4+ letters is removed, so `MARK'S`, `MARKS` and `MARK` compare equal. A query matches a candidate when all its name tokens are in the candidate's and all its directions are the candidate's. So "88th St" matches EAST, WEST and BEACH 88 STREET, and the borough and house number rules decide between them; "E 88th St" matches only EAST.

Known limits, accepted for now: no alias table beyond `B'way` (so `6 Ave` and `Avenue of the Americas` do not match), and the crude singular can equate unrelated names that differ only by a final `s`. Both surface as `street_mismatch` prompts or as an extra candidate, never as a silent wrong building.

Load-bearing assumption: geosearch returns features best-first, and the code never re-ranks (Requirement 1.7). With confidences tied there is no tiebreaker. The address checks reduce how much rests on that ordering, because they remove contradicting candidates before the top one is taken.

## Result shape
```ts
export type Candidate = BuildingId & {
  label: string;
  borough: string;
  confidence: number;
  housenumber: string | null;
  street: string | null;
  postcode: string | null;
};

export type AmbiguityReason = "no_housenumber" | "multiple_boroughs" | "street_mismatch" | "low_confidence";

export type ResolveResult =
  | { kind: "match"; building: Candidate }
  | { kind: "ambiguous"; candidates: Candidate[]; reason: AmbiguityReason }
  | { kind: "not_found" }
  | SourceError<"geosearch">;
```

Every dataset adapter in the later specs copies the `error` variant, so it is pinned here rather than left to each caller to invent. Adapters will not return `ambiguous` or `not_found`. `source` is a literal per adapter, which is what lets the report mark exactly one section unavailable.

`reason` exists so the UI can write a useful prompt rather than one generic disambiguation list: "which borough?" for `multiple_boroughs`, "which building on Broadway?" for `no_housenumber`, and "we couldn't find that street, did you mean...?" for `street_mismatch`.

The `error` variant is `SourceError<"geosearch">` from `src/types.ts`: `reason` (`timeout`, `aborted`, `network`, `http`, `malformed`), `status` for `http`, and a `message`.

## Resilience
`resolveAddress(text, { fetch, signal? })`. Nothing throws: a rejected fetch, a non-2xx status, a non-JSON body and a body that is not a feature collection all land as `kind: "error"`. A property test asserts this over arbitrary JSON.

Built (Requirement 5, tasks 3.5 and 3.6) as `fetchJson` in `src/http.ts`, shared with the Socrata client. Each attempt is bounded by `AbortSignal.any([AbortSignal.timeout(timeoutMs), callerSignal])`; `GEOSEARCH_TIMEOUT_MS` is 5000. One retry, after 250 ms, only after a network error or a 5xx. A caller abort or a timeout is never retried, so the worst case is about one timeout. Errors carry `reason` (`timeout`, `aborted`, `network`, `http`, `malformed`) and `status` for `http`, as the shared `SourceError` type in `src/types.ts`.

In-memory caching and the Socrata rate-limit strategy are deliberately absent here — they affect all seven adapters and belong in their own spec before those land.

## Testing strategy
Example tests for the verified buildings in docs/data-sources.md (A: BBL 3013610043, BIN 3036097; B: BBL 1015500031, BIN 1050055). Property tests for requirements 2, 3 and 4: round trip, idempotence, padding equivalence, cross-form agreement, and "invalid input never throws and only returns well-formed output".

Fixtures before rules. `scripts/record-geosearch-fixtures.mjs` records real `size=5` responses into `test/fixtures/`, trimmed to the fields the linker reads. Day 1: building A, building B, a bare street name, an address with no borough, and a no-results query. Day 2: the three queries the day-1 rules matched to the wrong building (`new-york-ny`, `wrong-housenumber`, `fake-street`) and a postcode query. The rules in Requirement 1.3 and 1.8 to 1.11 were set from what those show. The day-2 tests were written and seen failing against the day-1 code before the address checks were built.

Property tests for `classify`: a match never contradicts the query on house number, borough, postcode or street; results only remove candidates and keep geosearch's order; every candidate ahead of a match fails on its own; the same address in two boroughs with no place given is always `ambiguous`; a confident candidate queried by its own address is always a match. Property tests for `streetMatches`: reflexive, unaffected by letter case and punctuation, unaffected by adding a street-type word, never throws.

Re-record the fixtures with the script when geosearch changes; the tests assert facts (BBLs, boroughs), not whole responses, so small upstream changes do not break them.
