# Design: Building Dossier (draft)

Assumes the recommended options in requirements.md (D1 sections, D2 in-memory cache, D3 privacy list, D4 BBL records with a note).

## Shape
```
apps/web/app/building/[bbl]/page.tsx
  ├─ address + ranking (MySQL, as today)
  └─ <Suspense> per section ──► server component ──► getSection(source, building)
                                                      ├─ cache (apps/web/lib/cache.ts)
                                                      └─ adapter (packages/core/src/dossier/<source>.ts)
                                                           └─ socrataQuery (timeout 8 s, 1 retry)
```
- Each section is an async server component wrapped in its own `<Suspense>`, so Next streams the page shell first and each section as it arrives (Requirement 3.1, 3.2).
- **Risk to check on day one:** Hostinger serves the site through its CDN (`server: hcdn`). If it buffers streamed responses, the page would wait for the slowest section. Test with a deliberately slow section on the live site. Fallback: render section placeholders and fetch each section from a route handler (`/api/building/[bbl]/[section]`) in the browser.

## Adapters (`packages/core/src/dossier/`)
One file per source. Each exports:
- `query(building, window)`: the Socrata parameters. `$select` lists only shown columns (Requirement 4.1).
- `parse(rows)`: pure; turns rows into the section's view model and throws nothing.
- `fetch(building, window, opts)`: calls `socrataQuery` and returns `{ kind: "ok", data, rowCount } | SourceError<source>`.

Per-source queries (from the 2026-11-26 probe):

| Source | Queries |
|---|---|
| PLUTO | 1: by `bbl` |
| HPD violations | 2: open counts by class (`$group=class`, `violationstatus='Open'`); 20 most recent open ones |
| HPD complaints | 2: distinct complaints by `major_category` in the window; open distinct complaints |
| 311 | 1: top 10 `complaint_type` in the window |
| Evictions | 1: `executed_date` for residential evictions, newest first (dates only) |
| DOB | 2: legacy by `bin__`, DOB NOW by `bin`; merged, newest 10 |

A source with two queries runs them in parallel and fails as a whole if either fails, so a section never shows half its data.

Lookups for words (pure, tested): building class (D1 → "Elevator apartments"), DOB job type (A1/A2/A3/NB/DM...), and citation stripping for violation text.

## Cache (`apps/web/lib/cache.ts`)
- Map-based LRU, 2,000 entries, 6-hour TTL, keyed by `source|bbl|bin|windowEnd`. Including the window end means the cache turns over at New York midnight with the rankings.
- In-flight deduplication: a second caller awaits the first caller's promise (Requirement 3.4).
- Only `ok` results are stored.
- The clock is injected, so tests control expiry.

## Section states
`loading` (Suspense fallback) → `ok` with rows → `empty` ("No records found" plus what it can mean) → `unavailable` (error, with a retry link that reloads only that section) → `not_applicable` (DOB without a BIN). Requirement 2.4's banner needs all three HPD sections, so it is its own small component awaiting those three cached results.

## Testing
- Adapters: recorded fixtures for building A (real responses, trimmed), example tests per parser, and property tests: parsers never throw on arbitrary rows; counts are non-negative integers; no shown field comes from a column outside `$select`.
- Citation stripping: examples from real `novdescription` values, plus a property that it never returns an empty string for non-empty input.
- Cache: hit, expiry, LRU eviction, failure not cached, concurrent callers share one call.
- Page: a section whose fetch rejects renders "unavailable" while the others render.
