// Puts the refresh bundle where Hostinger will publish it. Run after `next build` (which empties .next).
//
// Hostinger builds Next.js with `output: "standalone"` and publishes only apps/web/.next/standalone
// (as hbuilds/current/nodejs) plus static assets, not apps/refresh/dist. So the self-contained bundle
// is copied to the standalone root, where the cron job runs it as hbuilds/current/nodejs/haunting-refresh.cjs.
// Local builds have no standalone folder; the copy then goes to apps/web/.next/ so the step is still exercised.
import { copyFileSync, existsSync } from "node:fs";

const from = new URL("../dist/refresh.cjs", import.meta.url);
const webOutput = new URL("../../web/.next/", import.meta.url);
const standalone = new URL("standalone/", webOutput);

if (!existsSync(webOutput)) {
  console.error("apps/web/.next does not exist: build the web app first (npm run build at the repo root).");
  process.exit(1);
}
const targetDir = existsSync(standalone) ? standalone : webOutput;
copyFileSync(from, new URL("haunting-refresh.cjs", targetDir));
console.log(`Copied the refresh bundle to apps/web/.next/${existsSync(standalone) ? "standalone/" : ""}haunting-refresh.cjs`);
