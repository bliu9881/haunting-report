# Requirements: Building Linker

Turns a free-text NYC address into one canonical building identity, and normalizes the identifiers each city dataset uses so rows from different datasets can be joined to that building.

## Requirement 1: Resolve an address to a building
**User story:** As a renter, I want to type an address and have the app find the right building, so that every dataset is looked up for the same place.

"The candidates" below means the geosearch features that carry a valid `pad.bbl`, normalized and de-duplicated by (BBL, BIN), in the order geosearch returned them, that survive the address checks in criteria 8 to 10. "The top candidate" is the first entry.

Acceptance criteria:
1. WHEN the user submits an address and none of the ambiguity rules in criteria 3 and 11 apply, THE system SHALL return a `match` carrying the top candidate's BBL, BIN, label, borough, confidence, house number, street and postcode.
2. WHEN geosearch returns no usable candidates, or none survive the address checks, THE system SHALL return `not_found` and SHALL NOT query any dataset.
3. THE system SHALL return `ambiguous`, carrying every candidate and a machine-readable reason, rather than picking one silently, WHEN:
   - a. the query carried no house number AND the candidates span more than one BBL (reason `no_housenumber`); or
   - b. the query named no borough, locality or postcode AND the candidates span more than one borough (reason `multiple_boroughs`); or
   - c. the top candidate's confidence is below `LOW_CONFIDENCE` (reason `low_confidence`).
4. IF the geosearch request fails, is aborted, returns a non-2xx status, or returns a body that is not a feature collection, THEN THE system SHALL return an `error` result that names geosearch as the failed source and SHALL NOT query any dataset.
5. WHEN the submitted text is empty or only whitespace, THE system SHALL return `not_found` without calling geosearch at all.
6. THE system SHALL de-duplicate candidates by (BBL, BIN), so one building reached through several street spellings counts once.
7. A `match` SHALL always be the top candidate. THE system SHALL NOT re-rank geosearch's feature order; the address checks only remove candidates.

Address checks. A check removes a candidate only when the candidate positively contradicts the query. A candidate missing the field being checked is kept.

8. WHEN the parsed query has a house number, THE system SHALL drop candidates whose house number differs, compared case-insensitively with whitespace removed (Queens `37-10` equals `37 -10`).
9. THE system SHALL count the query as naming a place only WHEN its parsed `borough` or `locality` names a borough, or it has a `postcode`. `New York`, `NY` and `NYC` name the city, not a borough, so they SHALL NOT count as a place. WHEN the query names a borough, THE system SHALL drop candidates in other boroughs. WHEN the query has a postcode, THE system SHALL drop candidates with a different postcode.
10. WHEN the house number, borough or postcode checks remove every candidate, THE system SHALL return `not_found`.
11. WHEN the parsed query has a street, and no remaining candidate's street matches it, THE system SHALL return `ambiguous` with reason `street_mismatch` and the remaining candidates. WHEN some candidates match, THE system SHALL keep only those. Streets match WHEN, after normalization, the query's name tokens are all in the candidate's, and any direction the query gives (East, West, North, South) is the candidate's direction. Normalization lower-cases, strips apostrophes and periods, turns ordinals into digits (`88th` to `88`), expands `E`/`W`/`N`/`S`, drops street-type words (`St`, `Street`, `Ave`, `Avenue`, `Saint` and similar) and maps `B'way` to `Broadway`.

The street check asks instead of dropping to `not_found`, because street names have many spellings this normalization does not know ("Avenue of the Americas" is `6 AVENUE`). Asking lets the user correct it; a false `not_found` would leave them stuck.

Criteria 2, 3, 4, 5, 10 and 11 together mean only a `match`, or a candidate the user picks from an `ambiguous` list, ever reaches a dataset adapter.

**Confidence is not a usable ranking signal.** Address queries return `confidence: 0.8` for every feature, right and wrong alike (all nine recorded fixtures with results). Landmark and postcode-only queries return `1` with `match_type: "exact"`. No probe has returned anything below 0.6. So criterion 3c is a backstop, and 3a, 3b and 8 to 11 carry the real decision because they compare the *query* with each candidate, not the result's score. Criterion 7 is load-bearing: with confidences tied, `classify` inherits geosearch's ordering.

**Day-2 finding.** The day-1 rules (criteria 1 to 7 alone) returned the wrong building, as a confident `match`, for three ordinary queries. Each is now a fixture with a test:
- `350 88th St, New York, NY` returned 350 88 Street, Brooklyn. "New York" counted as a place, so 3b never fired. Criterion 9.
- `100 Main St, New York, NY` returned 719 Main Street. No candidate had house number 100. Criteria 8 and 10.
- `123 Fake Street Queens` returned 123 St Felix Street, Brooklyn: wrong street and wrong borough. Criteria 9 and 11.

## Requirement 2: Normalize BBL
**User story:** As the linker, I want every BBL in one format, so that joins don't silently miss rows.

A BBL is valid WHEN it reduces to 10 digits: a borough digit 1 to 5, a 5-digit block that is not `00000`, and a 4-digit lot. Block `00000` is rejected because no real tax block is zero, so accepting it lets a row with a missing block join to a building that does not exist. Lot `0000` is permitted: DOF emits block-level records on lot 0.

Acceptance criteria:
1. THE system SHALL accept a BBL as a digit string, as a float string whose fractional part is all zeros such as `"1015500031.00000000"`, or as a number, and return a 10-character zero-padded digit string.
2. THE system SHALL return `null` for any input that does not reduce to a valid BBL.
3. FOR ALL valid (borough, block, lot) triples, composing a BBL and then parsing it SHALL return the original triple (round trip).
4. Normalizing an already-normalized BBL SHALL return it unchanged (idempotent).
5. FOR ALL valid BBLs, the digit-string, number and zero-fractional float-string forms SHALL normalize to the same value.

## Requirement 3: Compose BBL from borough, block and lot
**User story:** As the linker, I want to join rows that carry borough, block and lot but no usable BBL (DOB legacy permits, and any row whose `bbl` is null) to a building. Day 1 assumed HPD complaints had no BBL column; that was wrong (docs/data-sources.md, note 2).

Acceptance criteria:
1. THE system SHALL accept a borough as a full name in any letter case (`BROOKLYN`, `Brooklyn`), as a digit 1 to 5, or as the two-letter code PLUTO uses (`MN`, `BX`, `BK`, `QN`, `SI`) in any letter case.
2. THE system SHALL accept `STATEN IS` as an alias of `STATEN ISLAND`, and SHALL tolerate surrounding whitespace and repeated inner spaces in any borough name.
3. THE system SHALL accept block and lot as unpadded or zero-padded strings or numbers, and produce the same BBL for both forms (`"1361"` and `"01361"` are equal).
4. WHEN the borough is unrecognized, THE system SHALL return `null`. 311's `Unspecified`, an empty string and `null` are unrecognized.
5. WHEN block or lot is absent, empty, non-numeric or out of range, THE system SHALL return `null`.

## Requirement 4: Normalize BIN
A BIN is valid WHEN it is 7 digits led by a borough digit 1 to 5. `0000000` and `9999999` are not BINs.

Acceptance criteria:
1. THE system SHALL accept a BIN as a string, as a zero-fractional float string, or as a number, and return a 7-digit string, or `null` when it is not a valid BIN.
2. THE system SHALL treat `1000000`, `2000000`, `3000000`, `4000000` and `5000000` as placeholders meaning "no real BIN", and return `null` for them.
3. FOR ALL input, a non-null result SHALL match `/^[1-5]\d{6}$/` and SHALL NOT be one of the placeholders.

## Requirement 5: Bounded, injectable network access
**User story:** As a renter waiting on a report, I want a slow city API to degrade one section of the dossier, not hang the page.

Status: all five criteria implemented in `src/http.ts` and used by `resolveAddress` (tasks 3.5 and 3.6).

Acceptance criteria:
1. `resolveAddress` SHALL take an injected `fetch` and an optional `AbortSignal`, so tests never reach the network.
2. THE system SHALL apply a default timeout of `GEOSEARCH_TIMEOUT_MS` (5000 ms) to the geosearch request, and SHALL return an `error` result naming geosearch when it elapses.
3. WHEN a caller-supplied signal aborts, THE system SHALL return an `error` result rather than throwing.
4. THE system SHALL retry a failed geosearch request at most once, and only after a network error or a 5xx status. It SHALL NOT retry after a 4xx, a timeout, or a caller abort, so the worst case stays near one timeout.
5. Every `error` result SHALL carry a `reason` of `timeout`, `aborted`, `network`, `http` or `malformed`, and `http` errors SHALL carry the `status`, so the report can tell a slow source from a broken one.

## Verification
Probed on day 2; values recorded in docs/data-sources.md.
- PLUTO's `borough` holds only `MN`, `BX`, `BK`, `QN`, `SI`. Requirement 3.1 confirmed.
- 311 emits `Unspecified` for a missing borough. Requirement 3.4 confirmed.
- `STATEN IS` was not seen in any dataset probed. Requirement 3.2 keeps it as a harmless alias, unsupported by data so far.
- Evictions sometimes uses county names (`NEW YORK`, `KINGS`, `RICHMOND`). Not in Requirement 3 yet: evictions join on BBL, so this belongs in the adapter spec. If county names are ever added to `boroughCode`, Requirement 1.9 must still treat `New York` in a query as no place.
- Geosearch confidence: 0.8 for address queries and 1 for exact landmark or postcode matches; never below 0.6.

Still owed: whether any real tax block is `00000` (Requirement 2). The PLUTO probe timed out.

## Out of scope
- Fuzzy matching of misspelled addresses beyond what geosearch already does.
- In-memory caching and the Socrata rate-limit strategy. They affect all seven adapters and need their own spec before those land.
