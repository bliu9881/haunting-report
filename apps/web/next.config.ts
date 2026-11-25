import { existsSync } from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";

// Local development reads the repo-root .env. On Hostinger the variables come from the dashboard.
const rootEnv = path.join(__dirname, "..", "..", ".env");
if (process.env.NODE_ENV !== "production" && existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const config: NextConfig = {
  // The workspace packages ship TypeScript source (deployment.md).
  transpilePackages: ["@haunting/core", "@haunting/store"],
  // A database driver: keep it out of the server bundle.
  serverExternalPackages: ["mysql2"],
  poweredByHeader: false,
};

export default config;
