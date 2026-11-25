/**
 * Runs the store contract against the real Hostinger MariaDB, in throwaway tables with a random prefix.
 * Skipped unless RUN_DB_TESTS=1:  RUN_DB_TESTS=1 npm test -w @haunting/store
 */
import { existsSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import mysql from "mysql2/promise";
import { configFromEnv, createMariaStore, tableNames, swappedTables, type RankingStore } from "../src";
import { runStoreContract } from "./contract";
import { makeSnapshot, META } from "./helpers";

const enabled = process.env.RUN_DB_TESTS === "1";
const envFile = new URL("../../../.env", import.meta.url);
if (enabled && existsSync(envFile)) process.loadEnvFile(envFile);

const prefixes: string[] = [];
const stores: RankingStore[] = [];

async function open(extra: { beforeSwap?: () => Promise<void> } = {}): Promise<RankingStore> {
  const prefix = `t${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}_`;
  prefixes.push(prefix);
  const s = await createMariaStore({ ...configFromEnv(), tablePrefix: prefix, ...extra });
  stores.push(s);
  return s;
}

async function rawConnection() {
  const c = configFromEnv();
  const { address } = await (await import("node:dns/promises")).lookup(c.host, { family: 4 });
  return mysql.createConnection({ host: address, port: c.port, database: c.database, user: c.user, password: c.password });
}

describe.skipIf(!enabled)("MariaDB store", () => {
  afterAll(async () => {
    for (const s of stores) await s.close().catch(() => undefined);
    const conn = await rawConnection();
    for (const p of prefixes) {
      const t = tableNames(p);
      const names = [...swappedTables(t).flatMap((n) => [n, `${n}_next`, `${n}_old`]), t.refreshRun];
      await conn.query(`DROP TABLE IF EXISTS ${names.map((n) => `\`${n}\``).join(", ")}`);
    }
    await conn.end();
  }, 60_000);

  runStoreContract("mariadb", () => open(), { timeoutMs: 60_000 });

  it("keeps the previous rankings live when the database fails mid-publish", { timeout: 60_000 }, async () => {
    let fail = false;
    const s = await open({
      beforeSwap: async () => {
        if (fail) throw new Error("simulated failure after the _next tables were filled");
      },
    });
    const first = makeSnapshot(90, 0);
    const meta = await s.publish(first, META);
    fail = true;
    await expect(s.publish(makeSnapshot(40, 3), { ...META, runId: 2 })).rejects.toThrow(/simulated/);
    expect(await s.published()).toEqual(meta);
    for (const b of first.buildings) expect(await s.getBuilding(b.bbl)).toEqual(b);
    fail = false;
    await expect(s.publish(makeSnapshot(40, 3), { ...META, runId: 2 })).resolves.toMatchObject({ runId: 2 });
  });

  it("leaves no _next or _old tables behind, after a success or a failure", { timeout: 60_000 }, async () => {
    const s = await open();
    const prefix = prefixes[prefixes.length - 1] as string;
    await s.publish(makeSnapshot(), META);
    await s.publish({ ...makeSnapshot(), buildings: [{ ...makeSnapshot().buildings[0]!, score: -1 }] }, META).catch(() => undefined);
    const conn = await rawConnection();
    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      "SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name LIKE ?",
      [`${prefix.replace(/_/g, "\\_")}%`],
    );
    await conn.end();
    const names = rows.map((r) => String(r.name)).sort();
    expect(names.filter((n) => n.endsWith("_next") || n.endsWith("_old"))).toEqual([]);
  });

  it("refuses a second publish while one holds the lock", { timeout: 60_000 }, async () => {
    const s = await open();
    const t = tableNames(prefixes[prefixes.length - 1]);
    const conn = await rawConnection();
    const cfg = configFromEnv();
    await conn.query("SELECT GET_LOCK(?, 0)", [`${cfg.database}.${prefixes[prefixes.length - 1]}publish`.slice(0, 64)]);
    await expect(s.publish(makeSnapshot(), META)).rejects.toThrow(/in progress/);
    await conn.end(); // releases the lock
    await expect(s.publish(makeSnapshot(), META)).resolves.toMatchObject({ runId: 1 });
    expect(t.buildingMetric).toContain("building_metric");
  });

  it("publishes 20,000 buildings in batches, and reports the time", { timeout: 300_000 }, async () => {
    const s = await open();
    const snap = makeSnapshot(20_000);
    const t0 = performance.now();
    await s.publish(snap, META);
    const secs = (performance.now() - t0) / 1000;
    console.log(`publish 20,000 buildings: ${secs.toFixed(1)} s (projects to ~${((secs * 172_630) / 20_000).toFixed(0)} s for 172,630)`);
    const sample = snap.buildings[12_345]!;
    expect(await s.getBuilding(sample.bbl)).toEqual(sample);
  });
});
