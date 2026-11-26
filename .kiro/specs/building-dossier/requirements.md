# Requirements: Building Dossier

The live part of a building report: what the city's records say about this one building, fetched per request, one section per dataset. It sits below the address and the neighborhood ranking, which come from MySQL (spec: neighborhood-rankings).

Status: draft. Decisions D1 to D4 need the owner's sign-off.

## Glossary
- **Building**: the `match` (or the candidate the user picked) from the building-linker, identified by BBL and, when known, BIN.
- **Window**: the same 36 months as the rankings, ending today in New York (`rankingWindow`).
- **Section**: one block of the report, backed by exactly one source.
- **Source**: one Socrata dataset query set: PLUTO, HPD violations, HPD complaints, 311, evictions, DOB permits (legacy and DOB NOW together).

## Requirement 1: Sections and what they show
**User story:** As a renter, I want the building's housing record in plain terms, so I can judge it before I sign a lease.

**D1, sections (recommended):**

| Section | Source | Shows |
|---|---|---|
| Building facts | PLUTO | Year built, floors, residential units, building class in words |
| Open violations | HPD violations | Open counts by class (C, B, A); the 20 most recent open ones with inspection date, class, plain description, status, and a "rent impairing" flag |
| Complaints | HPD complaints | Distinct complaints in the window by category (heat, plumbing, pests...), and how many are open now |
| 311 requests | 311 | The 10 most common request types in the window, with counts |
| Evictions | Evictions | Residential evictions executed in the window, and the date of the most recent one ever |
| Construction | DOB legacy + DOB NOW | The 10 most recent permits or filings: date, job type in words, status |

Acceptance criteria:
1. THE report SHALL show the sections above in that order, each naming its dataset and its "data as of" date.
2. Counts in the window SHALL use the same window as the rankings, so the report and the ranking agree.
3. Violation descriptions SHALL drop the legal citations (`§ 27-2005, ...`) and keep the instruction text, without changing its meaning.
4. Dates SHALL be shown as New York civil dates (data-conventions). DOB legacy `MM/DD/YYYY` strings SHALL be parsed as civil dates.
5. Codes (building class, DOB job type, complaint category) SHALL be shown in words, with the code available for reference.

## Requirement 2: Never mistake "no records" for "clean"
**User story:** As a renter, I need to know whether a quiet section means a good building or missing data.

Acceptance criteria:
1. WHEN a source answers with zero rows, THE section SHALL say "No records found", and SHALL say what that can mean for that source. For example, for violations: the building may be well kept, may not be residential, or may be recorded under another identifier.
2. WHEN a source fails or times out, THE section SHALL say it is unavailable and offer a retry, and SHALL NOT show zero counts.
3. WHEN the building has no BIN, THE construction section SHALL say permits can't be looked up, instead of "No records found".
4. WHEN every HPD section is empty, THE report SHALL show one banner explaining that the building has no housing records, as product.md requires.

## Requirement 3: Fast and resilient
**User story:** As a renter, I want the report to appear quickly even when a city system is slow.

Acceptance criteria:
1. THE address, the ranking and the section frames SHALL render without waiting for any Socrata source.
2. Each source SHALL load independently, with its own timeout of `DOSSIER_SOURCE_TIMEOUT_MS` (8 s) and at most one retry after a network error or 5xx (building-linker Requirement 5). A slow or failing source SHALL affect only its own section.
3. **D2, caching (recommended): in memory.** A source's successful result for a building SHALL be cached for 6 hours, in at most 2,000 entries (least recently used goes first). Failures SHALL NOT be cached. The cache resets on deploy or restart.
   - Alternative: cache in MySQL, so results survive deploys. That costs a new table and a write per lookup. Add it only if demo visits still hit cold Socrata queries.
4. Two requests for the same building and source at the same time SHALL share one Socrata call.
5. Every source call SHALL send `SOCRATA_APP_TOKEN` when it is set.

## Requirement 4: Privacy
**User story:** As the publisher, I don't want the report to single out people.

**D3, what is never shown (recommended):** owner names (PLUTO, DOB), marshal names, eviction apartment numbers and docket numbers, permittee, applicant and filing-representative names and phone numbers, and complainant details.

Acceptance criteria:
1. THE adapters SHALL NOT request the columns above (`$select` lists only what is shown), so they can't leak through a later UI change.
2. Violation descriptions MAY keep apartment and floor locations, because they describe the building's condition, not a person.

## Requirement 5: Identifiers
Acceptance criteria:
1. HPD violations, HPD complaints, 311, evictions and PLUTO SHALL be queried by BBL; DOB legacy by `bin__`, DOB NOW by `bin`.
2. Every identifier placed in a query SHALL be normalized (`normalizeBbl`, `normalizeBin`) and quoted with `soqlString`.
3. **D4, multi-building lots (recommended): show the BBL's records and say so.** A tax lot can hold several buildings with different BINs, and geosearch gives one. HPD and 311 records follow the lot (BBL), while DOB records follow the building (BIN). The construction section SHALL state that it covers this building only.

## Out of scope
- The AI summary (its own spec, built on these sections).
- Datasets not in docs/data-sources.md (HPD litigation, registrations, bedbugs, DOB complaints).
- Historical charts.
