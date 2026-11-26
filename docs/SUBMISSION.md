# Haunting Report — Kiroween 2026 submission

**Category:** Frankenstein
**Live app:** https://perky-mediumvioletred-giraffe-73.hostingersite.com (no login)
**Repository:** https://github.com/bliu9881/haunting-report (MIT)
**Built with:** Kiro IDE, TypeScript, Next.js 16, MariaDB (Hostinger), NYC Open Data (Socrata), NYC Geosearch, Gemini, Model Context Protocol

---

## Inspiration

In New York, the most useful thing to know about an apartment is what the city already knows about its building: open hazardous violations, heat complaints every winter, evictions, a landlord who keeps getting cited. All of it is public. Almost none of it is usable. It is spread across separate city datasets that each identify buildings differently, and a renter with a lease to sign by Friday won't join them.

Haunting Report does that join, and asks one question a renter actually has: compared with the buildings around it, how bad is this one?

## What it does

Type an NYC address and you get the building's record:

- **Among its neighbors.** Every residential building with 3 or more apartments, about 172,000, is ranked within its neighborhood every night. The score is (3 × class C + 2 × class B + 1 × class A) HPD violations over 36 months, divided by apartments. A spirit board shows where the building falls, from Peaceful to Cursed, with the exact rank beside it: building A (1248 St Marks Ave, Brooklyn) is 266th most haunted of 2,955 buildings in Crown Heights (North), more haunted than 90% of its neighbors.
- **The medium's reading.** A 2 to 5 sentence summary written by Gemini from the records on the page, then checked by the server before it is shown. Any sentence that contains a number not in the records, cites a section that didn't load, gives advice, speculates, or calls the building safe is removed. Each sentence links to the section it came from.
- **Six live record entries:** open HPD violations (in plain English, with the legal citations stripped), complaints to HPD by problem, 311 requests, evictions, DOB permits, and building facts. Each names its dataset and how current it is.
- **Neighborhood pages** listing the most haunted buildings, with their violation counts.
- **Honest empty states.** A building with no housing records gets a notice saying that doesn't mean it's in good shape, because empty city data most often means HPD doesn't cover the building.
- **An MCP server**, so Kiro (or any MCP client) can look up buildings and read their records from chat.

### The Frankenstein part

Seven city datasets that were never meant to work together:

| Dataset | Identifies buildings by | The catch |
|---|---|---|
| HPD violations | `bbl` | text |
| HPD complaints | `bbl` | stored as a number |
| 311 requests | `bbl` | `Unspecified` borough on thousands of rows |
| Evictions | `bbl` | some rows use county names (`KINGS`, `RICHMOND`) |
| PLUTO (land use) | `bbl` | a float string, `"1015500031.00000000"`; boroughs as `BK`, `MN`… |
| DOB legacy permits | `bin__` | dates as `MM/DD/YYYY` text; often times out |
| DOB NOW filings | `bin` | different system, different columns |

Plus NYC Geosearch to turn free text into those identifiers, and the 2020 census tract to neighborhood crosswalk to place each building. Every quirk above is in `docs/data-sources.md`, found by probing the live APIs, not assumed.

## How it was built

```
packages/core    pure logic: identifiers, address resolution, Socrata client, scoring,
                 ranking, the six report adapters, the summary facts and checker
packages/store   rankings storage: MariaDB and an in-memory store, one shared test suite,
                 atomic table swap on publish
apps/refresh     nightly job: pulls ~615,000 rows (PLUTO + grouped counts), guards against short downloads,
                 ranks 172,630 buildings, publishes in one RENAME TABLE (~2.5 min on Hostinger)
apps/web         Next.js 16 site; each report section loads separately in the browser
apps/mcp         MCP server over the site's public JSON API
```

- 4,800 lines of TypeScript, 3,100 lines of tests.
- 315 automated tests (plus 11 integration tests that run against the real database), about 60 of them property-based with fast-check.
- 26 fixtures recorded from the live city APIs.

Deployed on Hostinger's managed Node.js hosting with a Hostinger MariaDB database and a nightly cron job.

## How Kiro was used

I built this in **Kiro IDE**, working with the agent from an empty folder on Nov 25 to a deployed app. Everything Kiro produced along the way is in `/.kiro`.

### Spec-driven development: six specs

| Spec | What it covers |
|---|---|
| `building-linker` | Address → one building, identifier normalization |
| `neighborhood-rankings` | Scoring, ranking, nightly refresh, storage |
| `building-dossier` | The six live report sections, caching, privacy |
| `ai-summary` | The medium's reading and its server-side check |
| `haunted-design` | The visual design, v1 and v2 |
| `mcp-server` | The MCP tools |

Each has `requirements.md` (EARS-style acceptance criteria), `design.md` and `tasks.md`. Decisions that were mine to make were written into the requirements as numbered decisions (D1, D2…) with a recommendation, and the agent stopped for sign-off before writing tasks. That is how the ranking formula, the neighborhood unit, the cache and the AI model were chosen.

The biggest difference from vibe coding was that **the specs changed when reality disagreed with them, and recorded why.** Three examples:

1. **The ambiguity rule.** The first requirement said to ask the user when Geosearch's confidence was low. Probing the API showed every address result scores exactly 0.8, right or wrong. The rule was rewritten to compare the parsed query with each candidate, and the note explaining why stayed in the requirement.
2. **Wrong-building matches.** When I edited the spec myself, the agent's review tested my assumptions against live Geosearch and found three ordinary queries returning the wrong building as a confident match, including "350 88th St, New York, NY" resolving to Brooklyn. Those became fixtures, the tests were run to fail first, then the address checks were built.
3. **Streaming.** The dossier design used React Suspense streaming. A test page on Hostinger showed its CDN buffers compressed responses until they finish, so the design changed to sections fetched by the browser, with the measurements in `design.md`.

Vibe coding was still the right tool for exploration: probing datasets, timing queries, reading deploy logs. Anything that would ship went through a spec.

### Steering docs: five

- `product.md` — every claim must trace to a dataset; empty data must never look clean; no owner names.
- `data-conventions.md` — the canonical building identity, normalize at the edge, and the date rule.
- `code-style.md` — pure functions for logic, property tests for invariants, injected `fetch`.
- `deployment.md` — Hostinger's constraints, each learned the hard way and written down: old glibc (so webpack plus WASM SWC), ES-module config loading, standalone output, CDN buffering, `127.0.0.1` not `localhost`, the cron command.
- `design-system.md` — the séance-ledger tokens, type and voice.

The date rule in `data-conventions.md` is a good example of steering paying off. Socrata timestamps have no time zone. Rendering them through UTC shows a 7:30 pm filing on the next day. Once that was a steering rule, every later adapter, the ranking window and the refresh's date math followed it without being reminded.

`deployment.md` mattered most. Every deploy surprise became a rule, so the next feature didn't repeat it.

### Property-based testing

About 60 properties across the packages. Some highlights:

- **Ranking:** a differential test against a naive O(n²) oracle, plus order independence.
- **Assembly:** matched plus unmatched counts always equal the input totals, so nothing is lost or counted twice.
- **The summary check:** any sentence using only known numbers and loaded sources survives, and adding one unknown number removes it.
- **Privacy:** no adapter ever selects a column that names a person, and even if Socrata sent one it never reaches the output.

A property caught a real bug that example tests missed: `count("")` returned 0, so an empty count string from Socrata would have been kept as a valid zero instead of dropped. The counterexample was the single row `{"bbl":"1000000000","n":""}`.

Real data caught what properties couldn't. The violation-citation stripper passed its tests. Then it was run over 1,000 real descriptions from all five boroughs, and it still left a citation at the start of 132 of them. The missed formats became tests; the final version cleans all 1,000.

### MCP

`apps/mcp` is a server with four read-only tools: `find_building`, `building_report`, `neighborhood_most_haunted` and `rankings_status`. It is registered in `.kiro/settings/mcp.json`. It reads the site's public JSON API, so it needs no keys, and anyone who clones the repo can ask Kiro "find 1248 St Marks Ave and summarize its open violations." I used it while developing to check buildings without a browser.

### Agent hooks

`.kiro/hooks/test-core-on-save.json` runs the core package's tests whenever a TypeScript file in `packages/core` is saved. Core holds all the pure logic, and its 214 tests run in about a second, so the hook catches a broken invariant at the moment of the edit.

### Skills

The visual redesign used Anthropic's `frontend-design` skill, installed in `.kiro/skills/frontend-design` (Apache 2.0). It flagged the first design as a set of common defaults: near-black with one bright accent, a stack of identical rounded cards, typewriter labels, and Creepster. The result was the séance-ledger redesign: plum and candle gold, IM Fell English, one continuous record instead of cards, and a single bold element, the spirit board.

### Not used

I didn't use Kiro Crew, custom agents or Kiro powers on this project.

## Challenges

- **Hostinger's build servers** have glibc older than Next.js's native compiler needs. The WASM fallback can't run Turbopack, and it can't load a TypeScript config either. The fixes were `next build --webpack`, a pinned `@next/swc-wasm-nodejs`, and `next.config.mjs`.
- **Hostinger publishes only Next's standalone folder,** so the nightly job's bundle wasn't on the server. I found that over SSH; the build now copies it in.
- **The first scheduled cron run fired and did nothing.** The cron form likely altered the command's `~`, `&&` or `>>`. It now calls a wrapper script with absolute paths that logs its own start and end.
- **Socrata is slow and flaky from shared hosting:** the same query took 0.3 to 11 s, with intermittent 503s. That is why every section loads, times out and retries on its own, and why results are cached.
- **The AI got numbers right and meaning wrong.** Early summaries said "121 open hazardous violations", a total that mixed in non-hazardous classes. Removing totals from the model's input means any total it adds up now fails the number check.

## Accomplishments

- The whole city is ranked every night, safely. A refresh that fails or comes back short leaves the previous rankings live, and the database tests prove it, including a failure injected mid-publish.
- An AI summary that is checked rather than trusted: a sentence with any number that isn't in the records is never shown.
- Missing data never looks like good news: a building with no records gets a notice, a failed section says it failed, and the summary is withheld if the housing records didn't load.

## What I learned

- Probe before you specify. Half of the requirements that changed did so because the live API behaved differently from its documentation, or from my assumptions.
- A spec is most useful when it keeps the reason for each decision. The "why" notes are what stopped the same mistakes coming back.

## What's next

- Owner-portfolio views. That needs a careful privacy design, because many owners are individuals.
- HPD litigation and registration data.
- A Spanish-language version.
- Alerts when a building you follow gets a new class C violation.

## Testing instructions for judges

No login is needed.

1. Open the live app and click the example searches on the home page:
   - `1248 St Marks Ave, Brooklyn`: a possessed walk-up.
   - `350 E 88th St, Manhattan`: an office building, which shows the "no housing records" notice.
   - `350 88th St, New York, NY`: asks which borough.
2. On a building page, click the neighborhood name to see its most haunted buildings.
3. `/api/health` shows which nightly refresh run is live.
4. A first visit to a building can take up to 20 seconds per section, because the city's datasets are slow on cold queries. A reload is near-instant.
5. To try the MCP server in Kiro: clone the repo, run `npm install`, and reconnect MCP servers. `.kiro/settings/mcp.json` is already in the repo.
6. To run the tests: `npm install && npm test`. No network or database is needed.

Data: NYC Open Data and NYC Geosearch. This is not legal advice or a safety guarantee.
