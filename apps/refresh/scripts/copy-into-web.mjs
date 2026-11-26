// Copies the refresh bundle into the web app's build output, because Hostinger deploys only the
// output directory (apps/web/.next), not apps/refresh/dist. The bundle is self-contained, so it runs
// from anywhere. Run after `next build`, which empties .next when it starts.
import { copyFileSync, existsSync } from "node:fs";

const from = new URL("../dist/refresh.cjs", import.meta.url);
const webOutput = new URL("../../web/.next/", import.meta.url);
const to = new URL("haunting-refresh.cjs", webOutput);

if (!existsSync(webOutput)) {
  console.error("apps/web/.next does not exist: build the web app first (npm run build at the repo root).");
  process.exit(1);
}
copyFileSync(from, to);
console.log("Copied the refresh bundle to apps/web/.next/haunting-refresh.cjs");
