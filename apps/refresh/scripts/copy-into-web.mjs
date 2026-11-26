// Puts the refresh bundle and its cron wrapper where Hostinger will publish them. Run after `next build`
// (which empties .next).
//
// Hostinger builds Next.js with `output: "standalone"` and publishes only apps/web/.next/standalone
// (as hbuilds/current/nodejs) plus static assets, not apps/refresh/dist. So both files are copied to the
// standalone root: hbuilds/current/nodejs/haunting-refresh.cjs and hbuilds/current/nodejs/haunting-cron.sh.
// Local builds have no standalone folder; the copies then go to apps/web/.next/ so the step is still exercised.
import { copyFileSync, existsSync } from "node:fs";

const webOutput = new URL("../../web/.next/", import.meta.url);
const standalone = new URL("standalone/", webOutput);

if (!existsSync(webOutput)) {
  console.error("apps/web/.next does not exist: build the web app first (npm run build at the repo root).");
  process.exit(1);
}
const targetDir = existsSync(standalone) ? standalone : webOutput;
copyFileSync(new URL("../dist/refresh.cjs", import.meta.url), new URL("haunting-refresh.cjs", targetDir));
copyFileSync(new URL("./cron.sh", import.meta.url), new URL("haunting-cron.sh", targetDir));
console.log(`Copied haunting-refresh.cjs and haunting-cron.sh to apps/web/.next/${existsSync(standalone) ? "standalone/" : ""}`);
