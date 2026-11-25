/**
 * Entry point for the nightly cron job and for manual runs:
 *   node --env-file=<path>/.env dist/refresh.cjs
 * Exit code 0 when rankings were published, 1 otherwise.
 */
import { configFromEnv, createMariaStore } from "@haunting/store";
import { runRefresh } from "./refresh";

async function main(): Promise<number> {
  let store;
  try {
    store = await createMariaStore(configFromEnv());
  } catch (err) {
    console.error(`Could not set up the database connection: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
  try {
    const result = await runRefresh({ store, fetch, appToken: process.env.SOCRATA_APP_TOKEN });
    return result.ok ? 0 : 1;
  } finally {
    await store.close().catch(() => undefined);
  }
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (err) => {
    console.error(err);
    process.exitCode = 1;
  },
);
