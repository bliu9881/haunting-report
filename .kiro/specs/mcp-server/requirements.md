# Requirements: Haunting Report MCP Server

An MCP server that lets Kiro (or any MCP client) query the stitched building data: find a building by address, read its report and ranking, and list a neighborhood's most haunted buildings. It is how the project uses MCP, a Kiro feature the judges score, and it is useful while developing (checking a building without opening a browser).

Status: approved 2026-11-26 (the owner asked for it directly). Decisions recorded below.

## Decisions
- **D1, where the data comes from: the live site's public JSON API**, not the database or Socrata directly. Anyone can run the server with no database password or API keys, and every call also exercises the deployed system. Address lookup calls NYC Geosearch directly through `resolveAddress`, because it is public and keyless. The base URL defaults to the live site and can be changed with `HAUNTING_BASE_URL` (for example to `http://localhost:3000`).
- **D2, transport: stdio**, started by Kiro from the workspace config `.kiro/settings/mcp.json`. No hosted MCP endpoint (Hostinger doesn't support always-running workers, and stdio needs no auth).
- **D3, read-only.** No tool writes anything or starts a refresh.

## Requirement 1: Tools
1. `find_building(address)`: resolves free text with the same rules as the site (building-linker spec). Returns the match (BBL, BIN, label), or the ambiguous candidates with the reason, or "not found".
2. `building_report(bbl, bin?, include_summary?)`: the six report sections and the ranking, as the site shows them, with each section's dataset "as of" dates. `include_summary` (default false) adds the AI reading.
3. `neighborhood_most_haunted(nta_code, limit?)`: the neighborhood's summary (count, median) and its top buildings (default 10, at most 50), with addresses, apartments, violation counts and scores.
4. `rankings_status()`: what `/api/health` reports (which refresh run is live, and when it was published).

## Requirement 2: Behaviour
1. Every input is validated before any request: BBL and BIN through `normalizeBbl` and `normalizeBin`, NTA codes against `^[A-Z]{2}\d{4}$`, `limit` from 1 to 50, addresses up to 200 characters.
2. A failing section or upstream is reported inside the result (the section is marked unavailable with its reason code); a tool call fails as a whole only when its inputs are invalid or nothing at all could be fetched.
3. Results come back both as structured content and as readable JSON text.
4. Nothing written to stdout except MCP messages; logs go to stderr.
5. No owner names or apartment numbers (they aren't in the site's API in the first place).

## Requirement 3: Site API additions
1. `GET /api/building/[bbl]/ranking`: the ranking lookup as JSON (`ranked`, `not_rankable` with reason, or `error` with a code only).
2. `GET /api/neighborhood/[nta]?limit=N`: the neighborhood summary and top buildings.
3. Both validate inputs (400 on bad ones) and return error codes only, as the other API routes do.
