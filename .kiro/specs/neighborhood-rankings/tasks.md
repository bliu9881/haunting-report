# Tasks: Neighborhood Rankings

Order: pure core first, because it needs no network or database. Then the Socrata client and sources, then storage, then the request path and UI. Tasks marked **(owner)** need the Hostinger account.

- [x] 1. Pure ranking core in `packages/core/src/ranking/` (Requirements 1.3, 1.6, 3, 4.3)
  - [x] 1.1 `score.ts`: `score(counts, unitsRes)` and `FORMULA_VERSION`. Properties: non-negative, 0 exactly with no violations, strictly increasing in each class, C outweighs B outweighs A, scaling counts and units together leaves the score exactly unchanged
  - [x] 1.2 `rank.ts`: `rankWithinNeighborhoods`, standard competition ranking per NTA, no rank below 20 buildings, `moreHauntedThan` share. Properties, plus a differential test against a naive O(n²) ranking, order independence, and a 20,000-building timing test (ties walked once, since most buildings score 0)
  - [x] 1.3 `refresh-guards.ts`: `rankingWindow(date)` (36 months of civil dates, 29 Feb clamped) and `shrunkSources(current, previous)` (80% rule). Example and property tests
- [x] 2. Prerequisite from building-linker: task 3.6 (`error.reason` and `status`), because `getRanking` and the Socrata client return the same error variant
- [x] 3. Socrata client in `packages/core/src/socrata.ts` (Requirement 4.4, 4.5)
  - [x] 3.1 `query(datasetId, params, { fetch, timeoutMs })` with a timeout, at most one retry after a network error or 5xx, and an optional `SOCRATA_APP_TOKEN` header
  - [x] 3.2 Paging for row pulls (`$limit` and `$offset`, 50k pages, stable `$order`). Aggregations are not paged (each page would re-run the `$group`); `socrataQueryAll` asks for up to 1M rows and fails if the result fills the limit
  - [x] 3.3 `datasetAsOf(datasetId)` from `/api/views/<id>.json` `rowsUpdatedAt`
  - [x] 3.4 Tests with an injected fetch; no network
- [x] 4. Refresh sources in `packages/core/src/ranking/sources/` (Requirement 4.4). Each source returns normalized rows (BBLs through `normalizeBbl`), plus a row count
  - [x] 4.1 NTA crosswalk `hm78-6dwm`: tract → `{ ntaCode, ntaName, ntaType }`
  - [x] 4.2 PLUTO `64uk-42ks`: `unitsres >= 3`, fields `bbl, address, borough, unitsres, bct2020`, paged
  - [x] 4.3 HPD violations `wvxf-dwi5`: `$group=bbl, class`, filter on `inspectiondate` within the window, one query per borough
  - [x] 4.4 HPD complaints `ygpa-z7cr`: `$group=bbl`, `received_date` within the window, per borough
  - [x] 4.5 Evictions `6z8x-wfk4`: `$group=bbl`, `residential_commercial_ind = 'Residential'`, `executed_date` within the window
  - [x] 4.6 Record one small real response per source as a fixture, and probe each query's timing per borough. Split by year where a borough takes over 60 s. Result: no split needed; the slowest was 14 s (docs/data-sources.md)
- [x] 5. Assemble (pure): join PLUTO + crosswalk + counts into building metrics, then score and rank. Buildings with no violations get score 0, not a missing row. `src/ranking/assemble.ts`: one row per PLUTO building with a `RankStatus`, neighborhood summaries (count, median), and `unmatched` totals for counts whose BBL is not in the PLUTO pull. 175k buildings assemble in about 0.1 s
- [x] 6. Storage (Requirement 4.2, 5)
  - [x] 6.1 `RankingStore` interface and an in-memory fake for tests. One contract suite (`test/contract.ts`) runs against both stores
  - [x] 6.2 `mysql2` implementation in `packages/store` (MariaDB 11.8): schema DDL, batched inserts into `*_next`, one `RENAME TABLE` swap, append-only `refresh_run`. Verified against Hostinger with `npm run test:db -w @haunting/store` in throwaway prefixed tables: contract suite, mid-publish failure, no leftover tables, publish lock, and 20,000 buildings in 2.4 s (about 20 s projected for 172,630)
  - [x] 6.3 **(owner)** Create the MySQL database and user in Hostinger, note MySQL or MariaDB, and allow the laptop IP under Remote MySQL. Result: MariaDB 11.8; laptop IPv4 allowed; `npm run db:check -w @haunting/store` passes
- [x] 7. Refresh script `apps/refresh` (Requirement 4)
  - [x] 7.1 Orchestrate: fetch sources, run the guards, assemble, write, swap, record. Failure leaves the previous rankings live. `runRefresh` takes the store, fetch, clock and logger as inputs; 8 tests against the in-memory store cover success, a source failure, a failure after a good run, the shrink guard, the first-run floors, the 25-minute deadline and a store failure
  - [x] 7.2 Build to a single JS file that runs on Node 24. `npm run build -w @haunting/refresh` → `apps/refresh/dist/refresh.cjs` (esbuild, 1.4 MB, `mysql2` bundled). Smoke-tested on Node 24.22
  - [x] 7.3 First full run from the laptop against Hostinger MySQL. Record the timing per source in docs/data-sources.md, and the `unmatched` totals. If unmatched violations are a large share, investigate condo BBLs (PLUTO uses the billing lot, 75xx) before trusting the rankings. Result: run 1 succeeded in 112 s on Node 24. Unmatched violations were 5.9%, almost all from buildings excluded by design; the condo risk did not show up (docs/data-sources.md)
- [x] 8. Request path: `getRanking(bbl)` returning `ranked`, `not_rankable` with a reason, or `error` (Requirement 1). In `packages/store/src/ranking-lookup.ts`, with a 3-second timeout; 7 tests
- [x] 9. UI in `apps/web` (Next.js 16, App Router, Node runtime). Functional styling only; the Halloween design comes later
  - [x] 9.1 Ranking section on the building report, with the refresh date and a link to the neighborhood page. Every not-rankable reason has its own message; a database failure shows "unavailable" and nothing else breaks
  - [x] 9.2 Neighborhood page: top 10, count, median (Requirement 2)
- [ ] 10. **(owner)** Deploy: Hostinger Node.js site, env vars, nightly cron. Site live 2026-11-25 (`/api/health` ok). `apps/refresh/dist` is not deployed, so the build now also copies the bundle into `apps/web/.next/haunting-refresh.cjs`. Verify the script's path under `hbuilds/current/nodejs/` and fill in the cron command in deployment.md
- [ ] 11. Checkpoint (local check done 2026-11-25: `next start` against Hostinger MariaDB served search, building A, an ambiguous search, building B, BK0802, and 404s for bad codes): tests and typecheck pass; one nightly run succeeds on Hostinger; every acceptance criterion traces to a test or a manual check
