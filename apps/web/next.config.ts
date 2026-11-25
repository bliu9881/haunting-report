import type { NextConfig } from "next";

// No __dirname or other CommonJS globals here: Hostinger loads this file as an ES module.
// Local development reads the repo-root .env through the `dev` script (node --env-file-if-exists).

const config: NextConfig = {
  // The workspace packages ship TypeScript source (deployment.md).
  transpilePackages: ["@haunting/core", "@haunting/store"],
  // A database driver: keep it out of the server bundle.
  serverExternalPackages: ["mysql2"],
  poweredByHeader: false,
};

export default config;
