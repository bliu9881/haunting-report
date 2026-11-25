# Data conventions

Read docs/data-sources.md before touching any dataset code.

- The canonical building identity is `{ bbl: string, bin: string | null }`. BBL is always a 10-character digit string: 1 digit borough, 5 digits block, 4 digits lot, zero-padded. Block is never `00000`.
- Normalize at the edge. Each dataset adapter converts its raw rows into the shared record type and normalizes identifiers there. Nothing downstream sees raw Socrata field names.
- Never compare identifiers as raw strings from different sources. Run them through `normalizeBbl`, `normalizeBin` and `boroughCode` first.
- Borough: `MANHATTAN`=1, `BRONX`=2, `BROOKLYN`=3, `QUEENS`=4, `STATEN ISLAND`=5. Accept any letter case, the digit form, and PLUTO's two-letter codes `MN`, `BX`, `BK`, `QN`, `SI`.
- Dates: Socrata timestamps carry no timezone and are New York civil time. Keep the civil date as the `YYYY-MM-DD` the timestamp already shows, and never round-trip it through UTC for display — a `2024-01-12T19:30` filing becomes `2024-01-13T00:30Z`, so a UTC rendering reports it on the 13th. Parse to a UTC instant only for sorting and comparison, interpreting the source as `America/New_York`, and keep that instant out of the UI.
- Network calls take an injected `fetch` and are bounded by a timeout, so tests never hit the network and a slow source cannot hang a report.
- A failing source degrades the report (mark that source as unavailable) and never fails the whole request. Every adapter result names its source so exactly one section can be marked unavailable.
