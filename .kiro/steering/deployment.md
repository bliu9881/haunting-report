# Deployment: Hostinger managed Node.js

Target: Hostinger's managed Node.js hosting (Business or Cloud plan), deployed from the GitHub repo. Every push to the deploy branch redeploys.
Sources: Hostinger support, "How to add a Node.js web app", "Node.js limits for web and cloud plans", "How to deploy monorepos" (checked 2026-11-25).

## Constraints the code must respect
- **Node 24.x** in production (Hostinger offers 18, 20, 22, 24). Don't use APIs newer than Node 24. Local development is on Node 25.
- **One long-running Node process per site.** In-memory caches persist across requests and reset on every deploy or restart.
- **120-second limit per request.** Each upstream call has its own timeout (geosearch 5 s; see the building-linker spec), so a report never gets close.
- **Not supported:** inbound WebSockets, always-running background workers, custom ports, Docker, Redis, Bun, Vercel-only features (Edge runtime, Vercel KV, `@vercel/*` packages). Use the Node.js runtime for every Next.js route.
- **Scheduled work** goes in a Hostinger cron job, not a timer inside the app.
- **Process limit:** one Next.js app uses about 10 to 11 threads, and `domain` and `www.domain` each run a process. Don't run more processes than you need.

## Build environment quirks (first deploy, 2026-11-25)
- Hostinger's build servers have glibc older than 2.29, so Next.js's native compiler (`@next/swc-linux-x64-gnu`) can't load. Next falls back to the WebAssembly compiler, which Turbopack can't use. So `apps/web` builds with **`next build --webpack`**, and `@next/swc-wasm-nodejs` is a pinned dependency at the same version as `next` (16.4.6). **Upgrade them together**, or the build fails with mismatched bindings.
- Reproduce locally with `NEXT_TEST_WASM=1 npm run build`; the default Turbopack build fails the same way it does on Hostinger.
- The Next config is **`next.config.mjs`, plain JavaScript**. With the WASM fallback, Next fails to compile a `next.config.ts` on Hostinger (`Cannot find module .../<hash>.next.config`), and a `.mjs` file needs no compile step. Keep it free of CommonJS globals (`__dirname`, `require`). The `dev` script loads the root `.env` with `node --env-file-if-exists`.
- Hostinger's build-failure assistant may suggest switching to Node 20 or older Next releases. Neither is needed: the glibc limit is in the server OS, and the fixes above cover it.
- esbuild (for `apps/refresh`) is a static Go binary and is not affected.

- **No streaming to browsers.** Hostinger's CDN buffers compressed responses until they finish, so React Suspense streaming does not reach browsers in pieces. It did stream when the request asked for no compression, but every browser asks for gzip or br. Load slow parts from the browser instead (building-dossier design).

## Build settings (monorepo)
- Root directory: `./` (the whole workspace has to be installed so `apps/web` can use `packages/core`)
- Package manager: npm, detected from `package-lock.json`
- Build command: `npm run build` (root script: builds `@haunting/web`, then `@haunting/refresh`, then copies the refresh bundle into the published folder). Hostinger forces Next.js `output: "standalone"` and publishes only `apps/web/.next/standalone` (as `hbuilds/current/nodejs`) plus static assets, so `apps/refresh/dist/` never reaches the server. The copy goes to `apps/web/.next/standalone/haunting-refresh.cjs`, which lands at `hbuilds/current/nodejs/haunting-refresh.cjs`. The web build must run first, because `next build` empties `.next`
- Start: `npm start` (root script: `next start` in `apps/web`, which listens on `$PORT`)
- Output directory: `apps/web/.next`
- `apps/web/next.config.mjs` lists `@haunting/core` and `@haunting/store` in `transpilePackages` (they ship TypeScript source) and `mysql2` in `serverExternalPackages`.
- On Hostinger, set `DB_HOST=127.0.0.1`, not `localhost` and not the remote hostname. With `localhost`, Node 17+ connects over IPv6 (`::1`) and gets "Access denied" (Hostinger's MySQL guide).
- Unverified until the first deploy: how Hostinger starts a Next.js app whose root is `./` but whose app is `apps/web`. If the Next.js preset can't find the app, use the "Other" preset with `npm run build` and `npm start`.
- Local production check: `set -a; . ./.env; set +a; NEXT_TEST_WASM=1 npm run build && PORT=3123 npm start`. That builds and runs the way Hostinger does.

## Secrets and configuration
Set these as environment variables in the Hostinger dashboard, never in the repo:
- `SOCRATA_APP_TOKEN` (raises NYC Open Data rate limits)
- `GEMINI_API_KEY` for the AI summary (ai-summary spec), from a Google AI Studio project with billing and prepaid credits. The free tier isn't available to this account. Optional `GEMINI_MODEL`, default `gemini-3.5-flash-lite`. Without a key the summary panel says no reading is available, and nothing else changes.

## Plan
Business web hosting. Hostinger no longer sells Business on most pages (it's now called Unlimited), and existing Business customers keep their own limits. Confirm the real numbers under **Hosting → Details** in the dashboard. The figures below are the current Unlimited ones.

## Database
Hostinger MySQL on the same plan, for neighborhood rankings only (spec: neighborhood-rankings). Building reports still don't use it.
- Limits: 3 GB per database, 60 s max query time, 75 connections per user (Unlimited plan figures). The app uses one pool of at most 5.
- Driver: `mysql2`, in `packages/store`. `npm run db:check -w @haunting/store` checks the connection; `npm run test:db -w @haunting/store` runs the storage tests against the real database in throwaway `t…_` tables and drops them afterwards. Credentials as env vars: `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`.
- Server: **MariaDB 11.8** (checked 2026-11-25 with `npm run db:check -w @haunting/store`). The app user has ALL PRIVILEGES on the app database only, which covers CREATE, DROP and RENAME for the table swap. Write SQL that MariaDB 11.8 runs; avoid MySQL-only syntax.
- For a first load from a laptop, allow its IP under **Databases → Remote MySQL**, and remove it afterwards. Allow the **IPv4** address: scripts connect over IPv4, because home IPv6 addresses change often. A login from an address that isn't allowed fails as `ER_ACCESS_DENIED_ERROR` (1045), the same error as a wrong password.

## Refresh cron job
- Command (200 characters, no `%`), checked over SSH in a minimal `sh` environment:
  `cd ~/domains/perky-mediumvioletred-giraffe-73.hostingersite.com/hbuilds && /opt/alt/alt-nodejs24/root/bin/node --env-file=config/.env current/nodejs/haunting-refresh.cjs >> ~/haunting-refresh.log 2>&1`
- Schedule: daily at 06:00 UTC, after midnight in New York, so the 36-month window ends on the new day.
- `hbuilds/config/.env` is generated by Hostinger from the dashboard's environment variables. `hbuilds/current` is a symlink to the live version, so the command always runs the latest deployed bundle. The log goes to `~/haunting-refresh.log`, outside `hbuilds`, so deploys don't erase it.
- Hostinger limits: 30 minutes per run, one command, at most 255 characters, no `%`.
- Timing on Hostinger (run 3, 2026-11-26): 451 s in total. Violations took 342 s, about 7 times slower than from the laptop, because Socrata answers the shared hosting IP slowly without an app token. Run 2 failed safely when one query passed the old 120 s per-query limit, which is now 300 s. A `SOCRATA_APP_TOKEN` should bring the time down.
- SSH access for maintenance: key `~/.ssh/hostinger_haunting` on the developer laptop, port 65002. Remove the key under Advanced → SSH Access when it's no longer needed.

## Judging
The live URL must work, with no login, until judging ends (2027-01-29). Keep the plan paid through then.
