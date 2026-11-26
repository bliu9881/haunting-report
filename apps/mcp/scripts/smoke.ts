// End-to-end check: starts the server exactly as .kiro/settings/mcp.json does (stdio), then calls every tool
// against the live site. Run from the repo root: npx tsx apps/mcp/scripts/smoke.ts [config, default apps/mcp/kiro-mcp.json]
import { readFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const cfg = JSON.parse(readFileSync(process.argv[2] ?? "apps/mcp/kiro-mcp.json", "utf8")).mcpServers["haunting-report"];
const transport = new StdioClientTransport({ command: cfg.command, args: cfg.args, env: { ...process.env, ...cfg.env } as Record<string, string>, stderr: "pipe" });
const client = new Client({ name: "smoke", version: "0" });
await client.connect(transport);

const show = (name: string, r: { structuredContent?: unknown; isError?: boolean }, pick: (s: any) => unknown) =>
  console.log(`${name.padEnd(26)} isError=${r.isError} ->`, JSON.stringify(pick(r.structuredContent)));

console.log("tools:", (await client.listTools()).tools.map((t) => t.name).join(", "));
const found = await client.callTool({ name: "find_building", arguments: { address: "1248 St Marks Ave, Brooklyn" } });
show("find_building", found as never, (s) => s.building);
show("find_building (ambiguous)", (await client.callTool({ name: "find_building", arguments: { address: "350 88th St, New York, NY" } })) as never, (s) => [s.kind, s.reason, s.candidates?.length]);
const t0 = performance.now();
const report = await client.callTool({ name: "building_report", arguments: { bbl: "3013610043", bin: "3036097", include_summary: true } });
show(`building_report (${((performance.now() - t0) / 1000).toFixed(1)} s)`, report as never, (s) => ({
  rank: s.ranking?.building?.rank,
  sections: Object.fromEntries(Object.entries(s.sections).map(([k, v]: [string, any]) => [k, v.kind])),
  summarySentences: s.summary?.sentences?.length,
}));
show("neighborhood_most_haunted", (await client.callTool({ name: "neighborhood_most_haunted", arguments: { nta_code: "bk0802", limit: 3 } })) as never, (s) => s.top?.map((b: any) => `${b.rank}. ${b.address} (${b.score.toFixed(1)})`));
show("rankings_status", (await client.callTool({ name: "rankings_status", arguments: {} })) as never, (s) => s.rankings);
await client.close();
