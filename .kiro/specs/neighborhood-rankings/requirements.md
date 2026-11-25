# Requirements: Neighborhood Rankings

Rank each building against the other residential buildings in its neighborhood, and list the most haunted buildings in every neighborhood. Rankings are precomputed by a nightly job into Hostinger MySQL. Building reports are still fetched live (product.md).

Status: approved 2026-11-25. Decisions D1 (NTA), D2 (violations-only score) and D3 (36 months) were accepted as recommended.

## Glossary
- **Neighborhood**: a 2020 Neighborhood Tabulation Area (NTA) of `ntatype` 0 (residential). There are 197. A building's NTA comes from PLUTO's `bct2020` (borough + 2020 census tract) joined to the city's tract-to-NTA crosswalk (`hm78-6dwm`). Example: building A is in tract `3034700`, NTA `BK0802` Crown Heights (North).
- **Rankable building**: a PLUTO lot with `unitsres` of 3 or more (172,630 citywide). Smaller buildings have too few records to compare fairly.
- **Window**: the 36 months ending on the refresh date.
- **Score**: the number a building is ranked by (Requirement 3).

**D1, neighborhood unit (approved): NTA.** Names like "Crown Heights (North)" are what renters recognize, and 173k rankable buildings over 197 NTAs averages about 900 per NTA (NTA `BK0801` has 956). Alternatives: community district (59 citywide, coarser, every dataset has the column), or ZIP code (familiar, but not a neighborhood).

## Requirement 1: Rank on the building report
**User story:** As a renter, I want to see how a building compares with its neighbors, so that I can tell a normal amount of trouble from an unusual one.

Acceptance criteria:
1. WHEN a report is shown for a rankable building in a residential NTA, THE system SHALL show its rank and the number of buildings ranked (for example "12th most haunted of 900 buildings in Crown Heights (North)"), and its percentile.
2. WHEN a building is not rankable, THE system SHALL say why (fewer than 3 units, not in PLUTO, no 2020 census tract in PLUTO, or in a non-residential NTA) and SHALL NOT show a rank.
3. WHEN the building's neighborhood has fewer than 20 rankable buildings, THE system SHALL NOT show a rank, and SHALL say the neighborhood is too small to compare.
4. THE system SHALL show the date the rankings were last refreshed, and the "data as of" date of each source used.
5. IF the database is unreachable, or holds no metrics for the building, THEN THE system SHALL mark the ranking section as unavailable and SHALL still show the rest of the report.
6. Buildings with equal scores SHALL share a rank, and the next rank SHALL skip accordingly (1, 2, 2, 4).

## Requirement 2: Neighborhood page
**User story:** As a renter choosing where to look, I want to see the most haunted buildings in a neighborhood.

Acceptance criteria:
1. THE system SHALL have a page per residential NTA listing its 10 highest-scoring buildings, each with address, residential units, the score's components and a link to the building's report.
2. THE page SHALL show the number of rankable buildings and the median score in the NTA.
3. THE building report SHALL link to its neighborhood page.
4. Rankings SHALL NOT show owner names. Many owners are individuals, and a "most haunted" list is a stronger claim than the raw records.
5. Every number on the page SHALL trace to counts from a named dataset (product.md).

## Requirement 3: Score
**User story:** As a renter, I want the ranking to reflect real, confirmed problems, scaled to the size of the building.

**D2, score formula (approved):**

`score = (3 × class C + 2 × class B + 1 × class A) HPD violations in the window, divided by residential units`

Reasons: violations are issued by an inspector, so they are confirmed. Class C means "immediately hazardous". Dividing by units keeps a 200-unit building from looking worse than a 6-unit one just for being larger.

Shown beside the score but **not** part of it:
- HPD complaints. They are unverified, and most arrive through 311.
- Executed residential evictions. They describe tenancy, not the building's condition.
- 311 is left out of rankings entirely: its housing complaints flow into HPD complaints (double counting), and it includes noise and street issues.

Rejected alternative: add `0.5 × complaints per unit` to the score. That captures problems an inspector never confirmed, at the cost of rewarding buildings whose tenants complain less.

Acceptance criteria:
1. THE score SHALL be computed by a pure function from the building's counts and residential units, so it can be property-tested.
2. THE score SHALL be non-negative, SHALL be 0 for a building with no violations in the window, and SHALL NOT decrease when any violation count increases (property).
3. THE stored rankings SHALL record the formula version, so changing weights means a new refresh, not a schema migration.
4. **D3, window (approved):** 36 months. Shorter windows react faster to new owners; longer ones are more stable.

## Requirement 4: Nightly refresh
**User story:** As the maintainer, I want rankings to stay current without manual work, and never to show half-loaded or wrong data.

Acceptance criteria:
1. A Hostinger cron job SHALL run the refresh nightly, and the refresh SHALL finish within Hostinger's 30-minute cron limit.
2. THE refresh SHALL load into staging tables and swap them into place in one step only after every source has loaded. On any failure, THE system SHALL keep serving the previous rankings and SHALL record the failure.
3. IF a source returns fewer than 80% of the rows it returned in the previous successful refresh, THEN THE refresh SHALL fail rather than publish. This stops a partial Socrata outage from silently giving buildings clean scores. Because the first run has nothing to compare with, every run SHALL also fail when a source falls below an absolute floor, set at about half of the 2026-11-25 counts (`MIN_ROWS` in `apps/refresh/src/refresh.ts`).
7. THE refresh SHALL stop itself after 25 minutes and record the run as failed, so Hostinger's 30-minute cron limit never kills it while the run is still marked as running.
4. Every Socrata request SHALL have a timeout, SHALL be retried at most once, and SHALL be split by borough (and by year if a borough is too slow) so that no single query runs near Socrata's limit.
5. THE refresh SHALL record its start and end time, the formula version, row counts per source, and each source's "data as of" date (Socrata `rowsUpdatedAt`).
6. THE refresh SHALL be idempotent, and SHALL be runnable from a developer machine against the Hostinger database, for the first load and for debugging.

## Requirement 5: Fit the Business plan
Acceptance criteria:
1. THE database SHALL stay well under the plan's 3 GB per-database limit. The estimate is under 100 MB.
2. Request-path queries SHALL be indexed lookups (by BBL, or by NTA ordered by score) that return in under a second. The refresh SHALL NOT run any single query near the plan's MySQL query-time limit.
3. THE app SHALL use one connection pool of at most 5 connections, well under the per-user connection limit.
4. Database credentials SHALL come from environment variables only (deployment.md).

## Open question Q1: small buildings at the top of neighborhood lists
Run 1 showed that the top 5 in Crown Heights (North) are all 3- to 6-unit buildings: for example, 6 units with 169 class C violations score 166.8. Dividing by units (D2) makes this correct: those tenants live with the most violations per apartment. But a single bad inspection can move a 3-unit building more than any large one, and a top-10 list made only of tiny buildings may read as noise. Options:
1. Keep as is, and show the unit count and raw counts next to each score (already in Requirement 2.1).
2. List only buildings with 6 or more units on the neighborhood page, and still rank every building on its report.
3. Divide by `max(units, 6)`, which damps tiny buildings in the score itself (formula v2).

Undecided. Option 1 needs no change.

## Out of scope
- City-wide rankings, trends over time, owner portfolios.
- Ranking buildings with fewer than 3 units.
- Live (non-precomputed) ranking.

## Delivery order
If time runs short, ship Requirement 1 (rank on the report) and Requirement 4 first. The neighborhood page (Requirement 2) reuses the same tables and can follow.
