# Design: Building Dossier

Implements the approved decisions in requirements.md (D1 sections, D2 in-memory cache, D3 privacy list, D4 BBL records with a note).

## Shape
```
apps/web/app/building/[bbl]/page.tsx   (server: address + ranking from MySQL, as today)
  └─ <DossierSection source=...> × 6    (client components, one fetch each)
        └─ GET /api/building/[bbl]/[source]?bin=...   (route handler, Node runtime)
              ├─ cache (apps/web/lib/cache.ts)
              └─ adapter (packages/core/src/dossier/<source>.ts)
                    └─ socrataQuery (timeout 8 s, 1 retry)
```
- The page renders immediately with six section frames in their loading state. Each section fetches its own JSON from the browser, so one slow or failing source affects only its own frame (Requirement 3.1, 3.2). Retry refetches that one section.

### Why not streaming (task 1, measured 2026-11-26)
The first plan was one `<Suspense>` boundary per section, streamed from the server. On Hostinger, a test page streamed correctly without compression (first part at 0.3 s, the 4-second part at 4.3 s). But with `Accept-Encoding: gzip` or `br`, which every browser sends, Hostinger's CDN (`server: hcdn`) buffered the whole response: first byte at 4.3 s. Streamed pages would wait for the slowest source. Client-fetched sections don't depend on streaming at all.

### Route handler
`GET /api/building/[bbl]/[source]?bin=<bin>`:
- Validates `bbl` with `normalizeBbl`, `bin` with `normalizeBin`, and `source` against the six names; anything else is a 400 with no detail.
- Returns `{ kind: "ok", data, asOf }`, `{ kind: "not_applicable" }` (DOB without a BIN), or `{ kind: "error", reason }` with status 503. Error messages are logged on the server, not returned (as `/api/health` does).
- Successful responses carry `Cache-Control: public, max-age=300`, so a reload within five minutes doesn't refetch. Errors carry `no-store`.

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
`loading` (before the fetch returns) → `ok` with rows → `empty` ("No records found" plus what it can mean) → `unavailable` (error, with a retry link that reloads only that section) → `not_applicable` (DOB without a BIN). Requirement 2.4's banner needs all three HPD sections, so it is its own small component awaiting those three cached results.

## Testing
- Adapters: recorded fixtures for building A (real responses, trimmed), example tests per parser, and property tests: parsers never throw on arbitrary rows; counts are non-negative integers; no shown field comes from a column outside `$select`.
- Citation stripping: examples from real `novdescription` values, plus a property that it never returns an empty string for non-empty input.
- Cache: hit, expiry, LRU eviction, failure not cached, concurrent callers share one call.
- Page: a section whose fetch rejects renders "unavailable" while the others render.
