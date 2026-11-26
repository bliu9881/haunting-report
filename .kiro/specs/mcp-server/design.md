# Design: Haunting Report MCP Server

## Shape
```
Kiro ──stdio──► apps/mcp/src/main.ts (McpServer, @modelcontextprotocol/sdk 1.32)
                  ├─ find_building ──────────► NYC Geosearch (resolveAddress from packages/core)
                  ├─ building_report ────────► site: /api/building/{bbl}/ranking, /{section} × 6, /summary (optional)
                  ├─ neighborhood_most_haunted ► site: /api/neighborhood/{nta}?limit=
                  └─ rankings_status ────────► site: /api/health
```
- `src/tools.ts`: the tool logic, with `fetch` and the base URL injected, so tests use a fake. Never throws on I/O.
- `src/server.ts`: registers the four tools with zod input schemas and read-only annotations; returns `structuredContent` plus the same JSON as text.
- `src/main.ts`: stdio transport; validates `HAUNTING_BASE_URL` (https, or http on localhost); logs only to stderr.
- Started with `tsx` from the TypeScript source, so there is no build step and nothing extra in Hostinger's build.

## Why the site API, not the database
The site's JSON routes already validate, cache and degrade per section, and they need no secrets. The MCP server inherits all of that and works for anyone who clones the repo. The cost is the site's latency: a cold `building_report` waits for the slowest section (21.5 s in the first smoke test, 2026-11-26), and a cached one returns in under a second.

## Timeouts
45 s per site request, above the site's own 20 s per-section limit, so a slow section comes back as the site's "unavailable" answer instead of a client timeout. No retries in the MCP server: the site already retries its upstreams.

## Kiro config
`.kiro/settings/mcp.json` (template in `apps/mcp/kiro-mcp.json`): `npx --no-install tsx apps/mcp/src/main.ts`, all four tools auto-approved because they are read-only. Kiro's docs don't say which directory a workspace stdio server starts in; the relative path assumes the workspace root. If Kiro's MCP logs show the file isn't found, use an absolute path.

## Testing
- `test/server.test.ts`: the tools against a fake site and recorded geosearch responses (validation before any request, one failing section, everything failing), and the server over the SDK's in-memory transport (tool list, schemas, structured content, schema rejection).
- `scripts/smoke.ts`: starts the server from the Kiro config over real stdio and calls every tool against the live site.
