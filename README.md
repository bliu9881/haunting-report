# Haunting Report

How haunted is your next NYC building? Type an address and get a report built from the city's own records: HPD housing violations, HPD complaints and evictions, ranked against every comparable building in the neighborhood.

Built with [Kiro](https://kiro.dev) for Kiroween 2026, Frankenstein category. NYC publishes these records as separate datasets that use different building identifiers. Haunting Report stitches them together into one record per building.

> Records can lag or be incomplete. This is not legal advice or a safety guarantee.

## What it does
- **Address search.** Resolves free text to one building with NYC's geosearch service. When an address is ambiguous (no house number, no borough, a street that doesn't match), it asks the user to choose instead of guessing.
- **Neighborhood ranking.** Every residential building with 3 or more apartments (about 172,000) is scored and ranked within its 2020 Neighborhood Tabulation Area. Score = (3 × class C + 2 × class B + 1 × class A) HPD violations over 36 months, divided by apartments.
- **Neighborhood pages.** The 10 highest-scoring buildings in each neighborhood, with their raw counts.
- **Nightly refresh.** A scheduled job pulls fresh counts from NYC Open Data and swaps them in atomically. If a source fails or comes back short, the previous rankings stay live.

## Repository layout
| Path | What it is |
|---|---|
| `packages/core` | Pure logic: identifier normalization, address resolution, the Socrata client, scoring, ranking and assembly. |
| `packages/store` | Ranking storage: a MariaDB/MySQL store and an in-memory store with one shared test suite. |
| `apps/refresh` | The nightly refresh, bundled to one file for the cron job. |
| `apps/web` | The Next.js app. |
| `docs/data-sources.md` | Every dataset, its identifiers and quirks, and what each probe found. |
| `.kiro/` | Kiro specs, steering and hooks used to build the project. |

## Run it locally
Requirements: Node.js 24 (Node 20.9 or later works), npm, and a MySQL or MariaDB database.

```sh
npm install
cp .env.example .env        # fill in DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD
npm test                    # unit and property tests; no network or database needed
npm run db:check -w @haunting/store   # checks the database connection

# Load the rankings (about 2 minutes)
npm run build -w @haunting/refresh
npm run refresh -w @haunting/refresh

# Start the web app on http://localhost:3000
npm run dev -w @haunting/web
```

`SOCRATA_APP_TOKEN` is optional. It raises NYC Open Data's rate limits.

## Production build
```sh
npm run build    # builds the refresh bundle and the web app
npm start        # starts the web app (honors $PORT)
```
The nightly job runs `node --env-file=<path to .env> apps/refresh/dist/refresh.cjs`. See `.kiro/steering/deployment.md` for the Hostinger setup.

## Data
All data comes from [NYC Open Data](https://opendata.cityofnewyork.us/): HPD Housing Maintenance Code Violations (`wvxf-dwi5`), HPD Complaints and Problems (`ygpa-z7cr`), Evictions (`6z8x-wfk4`), PLUTO (`64uk-42ks`) and the 2020 Census Tract to NTA equivalency (`hm78-6dwm`). Address search uses [NYC Geosearch](https://geosearch.planninglabs.nyc/).

## License
MIT. See [LICENSE](LICENSE).
