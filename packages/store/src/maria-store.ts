/** MariaDB RankingStore (neighborhood-rankings task 6.2). Hostinger runs MariaDB 11.8. */
import dns from "node:dns/promises";
import { isIP } from "node:net";
import mysql, { type Pool, type PoolConnection, type RowDataPacket } from "mysql2/promise";
import {
  assertCivilDate,
  BUILDING_COLUMNS,
  buildingToRow,
  fromSqlDateTime,
  InvalidRowError,
  NEIGHBORHOOD_COLUMNS,
  neighborhoodToRow,
  rowToBuilding,
  rowToNeighborhood,
  toSqlDateTime,
  validateBuilding,
  validateNeighborhood,
} from "./rows";
import { createRefreshRun, createSwapped, dropStatement, swappedTables, swapStatement, tableNames } from "./schema";
import { MAX_TOP, type NewRun, type PublishedRanking, type RankingSnapshot, type RankingStore, type RefreshRun, type RunOutcome } from "./types";

export interface MariaStoreConfig {
  host: string;
  port?: number;
  database: string;
  user: string;
  password: string;
  /** For integration tests. Default "". */
  tablePrefix?: string;
  /** Default 5 (Requirement 5.3). */
  connectionLimit?: number;
  /** Rows per INSERT. Default 2,000, well under the 16 MB packet limit. */
  batchSize?: number;
  /** Resolve a hostname to IPv4 first (the laptop's Remote MySQL allow-list is by IPv4). Default true. */
  preferIPv4?: boolean;
  /** Tests only: runs after the _next tables are filled, just before the swap. */
  beforeSwap?: () => Promise<void>;
}

/** Reads DB_* variables. Throws listing every missing one, without printing values. */
export function configFromEnv(env: NodeJS.ProcessEnv = process.env): MariaStoreConfig {
  const missing = ["DB_HOST", "DB_NAME", "DB_USER", "DB_PASSWORD"].filter((k) => !env[k]);
  if (missing.length > 0) throw new Error(`Missing environment variables: ${missing.join(", ")}`);
  return {
    host: env.DB_HOST as string,
    port: env.DB_PORT ? Number(env.DB_PORT) : 3306,
    database: env.DB_NAME as string,
    user: env.DB_USER as string,
    password: env.DB_PASSWORD as string,
  };
}

async function resolveHost(host: string, preferIPv4: boolean): Promise<string> {
  if (!preferIPv4 || host === "localhost" || isIP(host) !== 0) return host;
  try {
    return (await dns.lookup(host, { family: 4 })).address;
  } catch {
    return host;
  }
}

export async function createMariaStore(config: MariaStoreConfig): Promise<RankingStore> {
  const t = tableNames(config.tablePrefix ?? "");
  const batchSize = config.batchSize ?? 2000;
  const lockName = `${config.database}.${config.tablePrefix ?? ""}publish`.slice(0, 64);
  const pool: Pool = mysql.createPool({
    host: await resolveHost(config.host, config.preferIPv4 ?? true),
    port: config.port ?? 3306,
    database: config.database,
    user: config.user,
    password: config.password,
    connectionLimit: config.connectionLimit ?? 5,
    charset: "utf8mb4",
    timezone: "Z",
    dateStrings: true, // DATE stays a civil date; DATETIME is read as UTC text
    multipleStatements: false,
    connectTimeout: 10_000,
  });
  // Every connection works in UTC, so DATETIME columns hold UTC.
  pool.on("connection", (conn) => {
    conn.query("SET time_zone = '+00:00'");
  });

  async function ensureSchema(conn?: PoolConnection) {
    const q = conn ?? pool;
    for (const ddl of [...createSwapped(t, ""), createRefreshRun(t.refreshRun)]) await q.query(ddl);
  }

  async function insertBatches(conn: PoolConnection, table: string, columns: readonly string[], rows: unknown[][]) {
    const cols = columns.map((c) => `\`${c}\``).join(", ");
    for (let i = 0; i < rows.length; i += batchSize) {
      await conn.query(`INSERT INTO \`${table}\` (${cols}) VALUES ?`, [rows.slice(i, i + batchSize)]);
    }
  }

  async function countRows(conn: PoolConnection, table: string): Promise<number> {
    const [rows] = await conn.query<RowDataPacket[]>(`SELECT COUNT(*) AS n FROM \`${table}\``);
    return Number(rows[0]?.n);
  }

  const store: RankingStore = {
    ensureSchema: () => ensureSchema(),

    async publish(snapshot: RankingSnapshot, meta: Omit<PublishedRanking, "publishedAt">) {
      // Validate everything before touching the database, so bad input never reaches it.
      assertCivilDate(meta.windowStart, "windowStart");
      assertCivilDate(meta.windowEnd, "windowEnd");
      const seen = new Set<string>();
      for (const b of snapshot.buildings) {
        validateBuilding(b);
        if (seen.has(b.bbl)) throw new InvalidRowError(`Duplicate building ${b.bbl}`);
        seen.add(b.bbl);
      }
      seen.clear();
      for (const n of snapshot.neighborhoods) {
        validateNeighborhood(n);
        if (seen.has(n.ntaCode)) throw new InvalidRowError(`Duplicate neighborhood ${n.ntaCode}`);
        seen.add(n.ntaCode);
      }

      const conn = await pool.getConnection();
      const live = swappedTables(t);
      const next = live.map((n) => `${n}_next`);
      const old = live.map((n) => `${n}_old`);
      let locked = false;
      try {
        const [lockRows] = await conn.query<RowDataPacket[]>("SELECT GET_LOCK(?, 0) AS got", [lockName]);
        if (Number(lockRows[0]?.got) !== 1) throw new Error("Another publish is in progress");
        locked = true;

        await ensureSchema(conn);
        // Leftovers from a crashed run.
        await conn.query(dropStatement([...next, ...old]));
        for (const ddl of createSwapped(t, "_next")) await conn.query(ddl);

        await insertBatches(conn, `${t.buildingMetric}_next`, BUILDING_COLUMNS, snapshot.buildings.map(buildingToRow));
        await insertBatches(conn, `${t.ntaSummary}_next`, NEIGHBORHOOD_COLUMNS, snapshot.neighborhoods.map(neighborhoodToRow));
        const publishedAt = new Date().toISOString();
        await conn.query(
          `INSERT INTO \`${t.rankingMeta}_next\` (id, run_id, formula_version, window_start, window_end, source_as_of, published_at)
           VALUES (1, ?, ?, ?, ?, ?, ?)`,
          [meta.runId, meta.formulaVersion, meta.windowStart, meta.windowEnd, JSON.stringify(meta.sourceAsOf), toSqlDateTime(publishedAt)],
        );

        // Check that what landed matches what was sent, before it goes live.
        const [nb, nn] = [await countRows(conn, `${t.buildingMetric}_next`), await countRows(conn, `${t.ntaSummary}_next`)];
        if (nb !== snapshot.buildings.length || nn !== snapshot.neighborhoods.length) {
          throw new Error(`Row count mismatch after insert: buildings ${nb}/${snapshot.buildings.length}, neighborhoods ${nn}/${snapshot.neighborhoods.length}`);
        }

        await config.beforeSwap?.();
        await conn.query(swapStatement(t));
        await conn.query(dropStatement(old));
        return { ...meta, sourceAsOf: { ...meta.sourceAsOf }, publishedAt };
      } catch (err) {
        // Live tables are untouched unless the swap ran; remove the half-built copies.
        await conn.query(dropStatement(next)).catch(() => undefined);
        throw err;
      } finally {
        if (locked) await conn.query("SELECT RELEASE_LOCK(?)", [lockName]).catch(() => undefined);
        conn.release();
      }
    },

    async startRun(run: NewRun) {
      assertCivilDate(run.windowStart, "windowStart");
      assertCivilDate(run.windowEnd, "windowEnd");
      await pool.query(createRefreshRun(t.refreshRun));
      const [res] = await pool.query<mysql.ResultSetHeader>(
        `INSERT INTO \`${t.refreshRun}\` (started_at, status, formula_version, window_start, window_end) VALUES (?, 'running', ?, ?, ?)`,
        [toSqlDateTime(run.startedAt), run.formulaVersion, run.windowStart, run.windowEnd],
      );
      return Number(res.insertId);
    },

    async finishRun(id: number, o: RunOutcome) {
      const [res] = await pool.query<mysql.ResultSetHeader>(
        `UPDATE \`${t.refreshRun}\` SET finished_at = ?, status = ?, source_as_of = ?, row_counts = ?, error = ? WHERE id = ?`,
        [o.finishedAt === null ? null : toSqlDateTime(o.finishedAt), o.status, JSON.stringify(o.sourceAsOf), JSON.stringify(o.rowCounts), o.error, id],
      );
      if (res.affectedRows !== 1) throw new Error(`No refresh run ${id}`);
    },

    async lastSuccessfulRun() {
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT * FROM \`${t.refreshRun}\` WHERE status = 'succeeded' ORDER BY id DESC LIMIT 1`,
      );
      const r = rows[0];
      if (!r) return null;
      return {
        id: Number(r.id),
        startedAt: fromSqlDateTime(r.started_at),
        finishedAt: r.finished_at === null ? null : fromSqlDateTime(r.finished_at),
        status: r.status,
        formulaVersion: r.formula_version,
        windowStart: String(r.window_start),
        windowEnd: String(r.window_end),
        sourceAsOf: r.source_as_of ? JSON.parse(r.source_as_of) : {},
        rowCounts: r.row_counts ? JSON.parse(r.row_counts) : {},
        error: r.error ?? null,
      } satisfies RefreshRun;
    },

    async published() {
      const [rows] = await pool.query<RowDataPacket[]>(`SELECT * FROM \`${t.rankingMeta}\` WHERE id = 1`);
      const r = rows[0];
      if (!r) return null;
      return {
        runId: Number(r.run_id),
        formulaVersion: String(r.formula_version),
        windowStart: String(r.window_start),
        windowEnd: String(r.window_end),
        sourceAsOf: JSON.parse(String(r.source_as_of)),
        publishedAt: fromSqlDateTime(r.published_at),
      };
    },

    // Reads use prepared statements (binary protocol), so DOUBLE scores arrive exactly.
    async getBuilding(bbl: string) {
      const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT ${BUILDING_COLUMNS.join(", ")} FROM \`${t.buildingMetric}\` WHERE bbl = ?`,
        [bbl],
      );
      return rows[0] ? rowToBuilding(rows[0]) : null;
    },

    async getNeighborhood(ntaCode: string) {
      const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT ${NEIGHBORHOOD_COLUMNS.join(", ")} FROM \`${t.ntaSummary}\` WHERE nta_code = ?`,
        [ntaCode],
      );
      return rows[0] ? rowToNeighborhood(rows[0]) : null;
    },

    async topInNeighborhood(ntaCode: string, limit: number) {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_TOP) throw new RangeError(`limit must be 1 to ${MAX_TOP}`);
      // `limit` is a validated integer, interpolated because some servers reject LIMIT placeholders in prepared statements.
      const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT ${BUILDING_COLUMNS.join(", ")} FROM \`${t.buildingMetric}\`
         WHERE nta_code = ? AND status = 'ranked' ORDER BY score DESC, bbl LIMIT ${limit}`,
        [ntaCode],
      );
      return rows.map(rowToBuilding);
    },

    async close() {
      await pool.end();
    },
  };
  return store;
}
