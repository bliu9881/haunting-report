# Tasks: Haunting Report MCP Server

- [x] 1. Site API: `GET /api/building/[bbl]/ranking` and `GET /api/neighborhood/[nta]?limit=` (Requirement 3). Live check: valid requests return JSON; `ZZ9999` 404, `xx` 400, `limit=99` 400, a bad BBL 400
- [x] 2. `apps/mcp/src/tools.ts`: the four tools with injected fetch and input validation (Requirements 1, 2.1, 2.2)
- [x] 3. `apps/mcp/src/server.ts` and `main.ts`: zod schemas, read-only annotations, structured and text results, stdio, logs on stderr only (Requirement 2.3, 2.4). Checked: the server writes 0 bytes to stdout before a client speaks
- [x] 4. Tests: 10, over fakes and the SDK's in-memory transport
- [x] 5. Smoke test over real stdio against the live site (`apps/mcp/scripts/smoke.ts`), 2026-11-26: all four tools answered; `building_report` for building A returned the ranking (266), all six sections ok and a 4-sentence summary in 21.5 s from cold
- [ ] 6. **(owner)** Copy `apps/mcp/kiro-mcp.json` to `.kiro/settings/mcp.json` (Kiro blocks the agent from writing settings), reconnect MCP servers in Kiro, and try a tool from chat ("find 1248 St Marks Ave and tell me its open violations")
