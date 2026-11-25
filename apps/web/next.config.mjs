// Plain ESM JavaScript on purpose. Hostinger's build servers can't load Next's native SWC binary
// (glibc < 2.29), and with the WASM fallback Next fails to compile a next.config.ts
// ("Cannot find module .../<hash>.next.config"). A .mjs config is imported directly, with no compile step.
// No CommonJS globals (__dirname, require). The dev script loads the root .env.

/** @type {import("next").NextConfig} */
const config = {
  // The workspace packages ship TypeScript source (deployment.md).
  transpilePackages: ["@haunting/core", "@haunting/store"],
  // A database driver: keep it out of the server bundle.
  serverExternalPackages: ["mysql2"],
  poweredByHeader: false,
};

export default config;
