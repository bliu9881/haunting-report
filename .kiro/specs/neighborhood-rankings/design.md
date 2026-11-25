# Design: Neighborhood Rankings

Implements the approved decisions in requirements.md: D1 NTA, D2 violations-only score, D3 36-month window.

## Data flow
```
nightly cron (Hostinger, UTC)
  └─ refresh script (Node 24)
       1. NTA crosswalk  hm78-6dwm   ~2,300 rows, 1 request      → tract → NTA
       2. PLUTO          64uk-42ks   unitsres >= 3, ~173k rows, 4 pages of 50k
       3. HPD violations wvxf-dwi5   group by bbl, class; per borough; window filter on inspectiondate
       4. HPD complaints ygpa-z7cr   group by bbl; per borough; window filter on received_date
       5. Evictions      6z8x-wfk4   group by bbl; residential, executed in window
       6. score + rank in Node (pure functions in packages/core)
       7. write *_next tables, check row counts, RENAME TABLE swap, record refresh_run
web app (request path)
  ├─ building report: live dossier (building-linker + adapters) + getRanking(bbl) from MySQL
  └─ /neighborhood/[nta]: top 10 by score from MySQL
```

Timing evidence (day 2): the HPD violations Brooklyn aggregate since 2023 took 31 s and returned 73,653 BBLs. Fifteen aggregate queries (3 datasets × 5 boroughs) at up to 40 s each come to about 10 minutes, within the 30-minute cron limit. If a query gets close to its timeout, split it by year.

## Pure core (packages/core/src/ranking/)
- `score.ts`: `score(counts: ViolationCounts, unitsRes: number): number`. Properties: non-negative, 0 when there are no violations, monotonic in each class count, scales as 1/units.
- `rank.ts`: `rankWithin(buildings: { bbl, ntaCode, score }[]): Ranked[]`. Standard competition ranking per NTA (1, 2, 2, 4), descending score, ties broken only for display order (by BBL). Properties: rank 1 has the max score in its NTA; equal scores get equal ranks; ranks are within 1..count; NTAs with fewer than 20 buildings get no rank.
- Ranking in Node rather than SQL window functions: it is property-testable, and it does not depend on the database version. The Hostinger server is MariaDB 11.8. 173k rows fit easily in memory.

## Assembly (`assemble.ts`)
`assembleRankings(input, minNeighborhoodSize = 20)` is pure and deterministic (BBL order, no dependence on Map order). Every PLUTO building gets one row with a status:
- `no_tract`: PLUTO has no `bct2020` (87 buildings citywide).
- `unknown_tract`: the tract is not in the crosswalk.
- `non_residential_nta`: the NTA's type is not 0 (parks, airports, cemeteries).
- `small_neighborhood`: a residential NTA with fewer than 20 rankable buildings.
- `ranked`.

Every building is scored, ranked or not, so the report can still show its score. Counts default to 0, so a building with no records scores 0 instead of going missing. `stats.unmatched` totals the counts whose BBL matched no building in the pull (buildings under 3 units, condo unit lots, stale BBLs). Properties check that matched plus unmatched equals the input totals.

Known risk, to check on the first real run: PLUTO lists a condo under its billing lot (lot 75xx). If HPD records a condo's violations under the unit lots instead, those violations land in `unmatched`, and the condo looks cleaner than it is.

## Tables (`packages/store/src/schema.ts`)
```sql
building_metric  (bbl CHAR(10) PK, address, units_res, nta_code NULL, nta_name NULL,
                  viol_a, viol_b, viol_c, complaints, evictions, score DOUBLE, status VARCHAR(24),
                  nta_rank NULL, nta_count NULL, more_haunted_than DOUBLE NULL,
                  KEY nta_score (nta_code, score DESC, bbl))
nta_summary      (nta_code PK, nta_name, borough CHAR(1), building_count, median_score DOUBLE, ranked TINYINT(1))
ranking_meta     (id = 1 PK, run_id, formula_version, window_start DATE, window_end DATE,
                  source_as_of LONGTEXT (JSON), published_at DATETIME(3))
refresh_run      (id AUTO_INCREMENT PK, started_at, finished_at NULL, status, formula_version,
                  window_start, window_end, source_as_of NULL, row_counts NULL, error NULL,
                  KEY status_id (status, id))
```
The earlier draft had separate `nta` and `building` tables. They were folded into `building_metric` and `nta_summary`, because every read needs those columns together.

### Publish
`publish(snapshot, meta)`:
1. Validates every row in Node first (`validateBuilding`, `validateNeighborhood`, duplicate BBLs and NTA codes, civil dates), so bad input never reaches the database.
2. Takes `GET_LOCK('<db>.<prefix>publish', 0)`, so a second refresh can't publish at the same time.
3. Drops leftover `*_next` and `*_old` tables from a crashed run, then creates fresh `*_next` tables with the current DDL.
4. Inserts in batches of 2,000 rows, well under the 16 MB packet limit.
5. Checks that the `*_next` row counts equal the snapshot's.
6. Swaps all three tables with one `RENAME TABLE` (atomic in MariaDB), then drops the `*_old` tables.

If anything fails before the swap, it drops the `*_next` tables, and the live tables are untouched. `ranking_meta` is swapped with the data, so the "as of" date the UI shows always matches the rows. Because `*_next` is rebuilt with the current DDL on every publish, a column change in the three swapped tables takes effect on the next refresh without a migration. `refresh_run` is not swapped; its schema must stay compatible.

### Connections and types
- One pool of at most 5 connections. Every connection is set to `time_zone = '+00:00'`, with `dateStrings: true`. `DATE` columns come back as the civil `YYYY-MM-DD` and are never shifted by a timezone; `DATETIME(3)` is UTC text, converted to ISO.
- Reads use prepared statements (binary protocol), so `DOUBLE` scores come back exactly; the contract tests compare them with `toEqual`. `LIMIT` is a validated integer between 1 and 50, written into the SQL.
- Table names can take a prefix (validated as `[a-z][a-z0-9_]{0,23}`), so integration tests run in throwaway tables in the same database.

## Request path
- `getRanking(bbl)` returns `{ kind: "ranked", rank, count, percentile, ntaName, asOf }`, or `{ kind: "not_rankable", reason }`, or `{ kind: "error", source: "rankings", ... }` (the error variant from the building-linker spec).
- A single `mysql2` pool, at most 5 connections, created lazily once per process. Hostinger runs one long-lived process, so the pool is reused.
- The DB is read behind a small interface so tests use an in-memory fake.

## Deployment specifics
- The refresh script is compiled to plain JS during the build, so the cron job runs it with Hostinger's Node 24 binary and `--env-file` (see deployment.md). Hostinger's Node runs `.ts` only with explicit import extensions, which `packages/core` does not use.
- **Unverified:** where the compiled script lands under `hbuilds/current/nodejs/` after a monorepo build. Check after the first deploy, then fill in the cron command (at most 255 characters, no `%`).
- First load runs from a laptop. Allow the laptop's IP in Hostinger's Remote MySQL settings, then remove it afterwards.

## Dependencies
- `mysql2` (in `packages/store`): MySQL and MariaDB driver with pooling and prepared statements. (The older `mysql` package fails against current server auth modes, a known Hostinger issue.)
- A bundler for the refresh script (esbuild, or `tsc` with emitted `.js` extensions). Chosen in tasks.
