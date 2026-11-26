import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { buildingReport, findBuilding, neighborhoodMostHaunted, rankingsStatus, type ToolDeps, type ToolOutput } from "./tools";

function toResult(out: ToolOutput) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(out.result, null, 2) }],
    structuredContent: out.result,
    isError: out.isError,
  };
}

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true } as const;

export function createServer(deps: ToolDeps): McpServer {
  const server = new McpServer({ name: "haunting-report", version: "0.1.0" });

  server.registerTool(
    "find_building",
    {
      title: "Find an NYC building",
      description:
        "Resolve a free-text New York City address to one building (BBL and BIN), using NYC Geosearch with Haunting Report's address checks. Returns the match, or the candidates and why the address is ambiguous, or not_found.",
      inputSchema: { address: z.string().min(1).max(200).describe("For example: 1248 St Marks Ave, Brooklyn") },
      annotations: READ_ONLY,
    },
    async (args) => toResult(await findBuilding(deps, args)),
  );

  server.registerTool(
    "building_report",
    {
      title: "Read a building's haunting report",
      description:
        "The building's neighborhood ranking and its six live record sections (building facts, open HPD violations, HPD complaints, 311 requests, evictions, DOB permits), each with its dataset's 'data as of' dates. A section that fails is marked unavailable. Optionally includes the AI summary ('the medium's reading').",
      inputSchema: {
        bbl: z.string().describe("10-digit borough-block-lot, e.g. 3013610043 (from find_building)"),
        bin: z.string().optional().describe("7-digit building number, if known; permits are then limited to this building"),
        include_summary: z.boolean().optional().describe("Also return the AI summary. Default false"),
      },
      annotations: READ_ONLY,
    },
    async (args) => toResult(await buildingReport(deps, args)),
  );

  server.registerTool(
    "neighborhood_most_haunted",
    {
      title: "Most haunted buildings in a neighborhood",
      description:
        "A 2020 Neighborhood Tabulation Area's summary (rankable buildings, median score) and its highest-scoring buildings. Score = (3 × class C + 2 × class B + 1 × class A) HPD violations in the last 36 months, divided by apartments.",
      inputSchema: {
        nta_code: z.string().describe("NTA code, e.g. BK0802 (Crown Heights North); building_report's ranking gives it"),
        limit: z.number().int().min(1).max(50).optional().describe("How many buildings, 1 to 50. Default 10"),
      },
      annotations: READ_ONLY,
    },
    async (args) => toResult(await neighborhoodMostHaunted(deps, args)),
  );

  server.registerTool(
    "rankings_status",
    {
      title: "Rankings status",
      description: "Which nightly refresh run is live and when it was published (the site's /api/health).",
      annotations: READ_ONLY,
    },
    async () => toResult(await rankingsStatus(deps)),
  );

  return server;
}
