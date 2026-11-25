# Data sources (verified)

Probed live on day one. Test building A: 1248 St Marks Ave, Brooklyn (BBL 3013610043, BIN 3036097).
Test building B: 350 E 88th St, Manhattan (BBL 1015500031, BIN 1050055). B is commercial, so it is the "no housing records" case.

Geocoder: `https://geosearch.planninglabs.nyc/v2/search?text=<address>&size=1`.
Returns `properties.addendum.pad.bbl` and `.bin`. No key needed.
The day-one probe above used `size=1`. The linker queries `size=5`, because it has to offer the user a choice when a match is ambiguous; see .kiro/specs/building-linker/design.md.

Socrata base: `https://data.cityofnewyork.us/resource/<id>.json` (no key needed for light use; add an app token for rate limits).

| Dataset | Socrata id | Join key | Key format | Rows for building A |
|---|---|---|---|---|
| HPD housing violations | `wvxf-dwi5` | `bbl` | 10-digit string | 691 |
| HPD complaints and problems | `ygpa-z7cr` | `bbl` (also `borough` + `block` + `lot`, `building_id`) | 10-digit string. Day 1 said "no `bbl` column": wrong, see note 2 | 838 |
| 311 service requests | `erm2-nwe9` | `bbl` | 10-digit string | 386 |
| Evictions | `6z8x-wfk4` | `bbl` | 10-digit string | 3 |
| DOB permit issuance (legacy) | `ipu4-2q9a` | `bin__` | BIN; block and lot are zero-padded (`01550`, `00031`) | 4 |
| DOB NOW job filings | `w9ak-ipjd` | `bin` | BIN | 1 |
| PLUTO (building facts) | `64uk-42ks` | `bbl` | **float string** `"1015500031.00000000"` | 1 |

## Identifier mismatches the linker must handle
1. PLUTO returns BBL as a float string.
2. **Corrected on day 2:** HPD complaints do have a `bbl` column. Querying `bbl=3013610043` returns 838 rows, the same as borough + block + lot. The day-1 sample row omitted it, because Socrata leaves out fields that are null for that row. Lesson: check a dataset's columns with `/api/views/<id>.json`, not from one sample row. `composeBbl` is still needed as a fallback for rows whose `bbl` is null, and for DOB legacy permits.
3. DOB legacy permits pad block and lot with zeros and key on BIN.
4. Borough appears as a name (`BROOKLYN`, sometimes `MANHATTAN`), a digit (`boroid`), or inside the BBL's first digit.
5. Commercial or non-residential buildings return zero housing records. The UI must say so, not show a clean score.
6. Borough column values, probed on day 2 with `$group=borough`:

| Dataset | Values seen | Notes |
|---|---|---|
| PLUTO `64uk-42ks` | `QN`, `BK`, `SI`, `BX`, `MN` | Two-letter codes only. |
| 311 `erm2-nwe9` | full names in capitals, plus `Unspecified` | 4,565 `Unspecified` rows since 2025-10-01. Whole-dataset group-by times out; filter by date. |
| HPD violations `wvxf-dwi5` (`boro`) | full names in capitals | |
| Evictions `6z8x-wfk4` | full names in capitals, plus county names `NEW YORK` (100), `KINGS` (99), `RICHMOND` (10) | Joins on BBL, so this only matters for rows without one. Handle in the evictions adapter. |
| DOB NOW `w9ak-ipjd` | `Brooklyn` style (title case) | Probed with `bin like '3%'` only. |
| HPD complaints `ygpa-z7cr`, DOB legacy `ipu4-2q9a` | not confirmed | Group-by timed out. Single rows on day 1 showed `BROOKLYN` and `MANHATTAN`. |

`STATEN IS` was not seen anywhere.

7. Still unverified: whether any real tax block is `00000`. The PLUTO `block = 0` count timed out.

## Neighborhood data (probed day 2, for neighborhood-rankings)
- PLUTO has `bct2020` (borough digit + 6-digit 2020 tract, e.g. `3034700`), `cd`, `zipcode`, `unitsres`, `bldgclass`. 172,630 lots have `unitsres >= 3`.
- Tract-to-NTA crosswalk: `hm78-6dwm` (2,327 rows). Join PLUTO `bct2020` to `boroct2020`. It gives `ntacode`, `ntaname`, `ntatype`. Type `0` is residential (197 NTAs). The other types are parks, airports, cemeteries and the like.
- Building A: tract `3034700`, NTA `BK0802` Crown Heights (North).
- Neighborhood columns per dataset: HPD complaints and evictions have `nta`; HPD violations has `communityboard`, `censustract`; 311 has `community_board`, `incident_zip`. The rankings use only `bbl` from these, and take the NTA from PLUTO.
- Aggregation speed, first probe: HPD violations, Brooklyn, `inspectiondate >= 2023-01-01`, `$group=bbl` returned 73,653 rows in 31 s.
- Aggregation speed, refresh queries (window 2023-11-25 to 2026-11-25, probed 2026-11-25):

| Query | MN | BX | BK | QN | SI |
|---|---|---|---|---|---|
| Violations `$group=bbl, class` | 9 s, 46,971 rows | 14 s, 56,217 | 11 s, 138,421 | 7 s, 70,313 | 2 s, 8,072 |
| Complaints `count(distinct complaint_id)`, `$group=bbl` | 7 s, 17,713 | 10 s, 18,181 | 11 s, 35,794 | 6 s, 22,491 | 4 s, 3,601 |

  Evictions (citywide, residential, executed in the window): 5 s, 21,455 rows. The whole set is about 1.5 minutes, so no year split is needed. Timings vary between runs; the 31 s first probe was the same kind of query.
- Data quirks the refresh handles:
  - Violation classes are `A`, `B`, `C` and `I` (information orders). `I` is not scored.
  - Every grouped result has rows with `bbl` "0" or no `bbl` at all. For Brooklyn complaints, one such row stood for 1,932 complaints. They are dropped and counted as `dropped`.
  - A borough query can return BBLs from another borough (5 rows in Brooklyn complaints, 1 in Manhattan violations). Counts are summed per BBL across borough queries, so nothing is overwritten.
  - 87 PLUTO lots with 3 or more residential units have no `bct2020`. They can't be placed in a neighborhood, so they're not rankable.
  - Building A in the window: violations A 21, B 102, C 77; 64 distinct complaints.

## First full refresh (run 1, 2026-11-25, Node 24 from the laptop)
| Source | Rows | Dropped | Time |
|---|---|---|---|
| crosswalk | 2,327 | 0 | 4.2 s |
| PLUTO (3+ units) | 172,630 | 0 | 8.8 s |
| violations (5 borough queries) | 319,994 | 32 | 48.4 s |
| complaints (5 borough queries) | 97,780 | 9 | 32.9 s |
| evictions | 21,455 | 2 | 4.3 s |

Assembly took 181 ms, the publish 11.1 s, the whole run 112 s.
- Status: ranked 172,499; small_neighborhood 36; non_residential_nta 8; no_tract 87; unknown_tract 0. 197 neighborhoods.
- Unmatched data: 157,837 of 2,657,485 class A, B and C violations (5.9%) and 130,215 of 1,610,241 complaints (8.1%) matched no ranked building.
  - By lot type, the unmatched violations were: regular lots 156,741; invalid BBLs 2,502; condo billing lots (75xx) 1,009; condo unit lots 87.
  - A random sample of 300 unmatched regular-lot BBLs, looked up in PLUTO: 257 have 1 or 2 residential units and 34 have none, so both groups are excluded by design. 9 are not in PLUTO, and 0 have 3 or more units.
  - So unmatched data is almost entirely small buildings left out on purpose. **The condo risk did not show up**: condo-related violations are 0.04% of the total.
- The crosswalk's `rowsUpdatedAt` is 2021-09-20. It's a static dataset, so an old date is expected; the UI should not present it as stale.
- Building A: rank 266 of 2,955 in Crown Heights (North), more haunted than 90.9% of its neighbors. The neighborhood median score is 0.75.
- The top of the BK0802 list is all 3- to 6-unit buildings (scores 108 to 167). Dividing by units makes small buildings with many violations rank highest. That's correct under D2, but see the open question in the neighborhood-rankings spec.

## Geosearch behavior (probed day 2)
- `confidence` is `0.8` (`match_type: "fallback"`) for every address query, right or wrong. Landmark and postcode-only queries return `1` (`"exact"`). Nothing below 0.6 has been seen.
- Geosearch returns the nearest it can find, not only real matches. `100 Main St, New York, NY` returns five buildings numbered 668 to 719, and `123 Fake Street Queens` returns real streets in Brooklyn, Manhattan and Queens.
- `New York, NY` parses as `locality: "New York"`, which names the city, not a borough.
- Misspellings are handled well: `1248 St Mraks Ave Brooklyn` returns building A first.
- Each feature carries `housenumber`, `street` and `postalcode`, which the linker's address checks compare with the parsed query.
