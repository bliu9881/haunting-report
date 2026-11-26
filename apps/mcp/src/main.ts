// Stdio entry point. Kiro starts it from .kiro/settings/mcp.json. Only MCP messages go to stdout; logs go to stderr.
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server";
import { DEFAULT_BASE_URL } from "./tools";

function baseUrl(): string {
  const raw = process.env.HAUNTING_BASE_URL?.trim();
  if (!raw) return DEFAULT_BASE_URL;
  const u = new URL(raw);
  if (u.protocol !== "https:" && !(u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1"))) {
    throw new Error("HAUNTING_BASE_URL must be https, or http on localhost");
  }
  return u.origin;
}

const url = baseUrl();
const server = createServer({ fetch, baseUrl: url });
await server.connect(new StdioServerTransport());
console.error(`haunting-report MCP server ready (site: ${url})`);
