// Connects with the DB_* settings in .env and prints the server type, version and the user's grants.
// Never prints the host, user or password. Run: npm run db:check -w @haunting/store
import dns from "node:dns/promises";
import mysql from "mysql2/promise";

const required = ["DB_HOST", "DB_NAME", "DB_USER", "DB_PASSWORD"] as const;
const missing = required.filter((k) => !process.env[k]);
if (missing.length > 0) {
  console.error(`Missing in .env: ${missing.join(", ")}`);
  process.exit(1);
}

const started = Date.now();
try {
  // Force IPv4: home IPv6 addresses rotate, so Hostinger's Remote MySQL allow-list is set by IPv4.
  const { address } = await dns.lookup(process.env.DB_HOST as string, { family: 4 });
  const conn = await mysql.createConnection({
    host: address,
    port: Number(process.env.DB_PORT ?? 3306),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    connectTimeout: 10_000,
  });
  const [[row]] = (await conn.query("SELECT VERSION() AS version, @@version_comment AS comment, DATABASE() AS db")) as unknown as [
    { version: string; comment: string; db: string }[],
  ];
  const [grants] = (await conn.query("SHOW GRANTS FOR CURRENT_USER()")) as unknown as [Record<string, string>[]];
  const [[timing]] = (await conn.query("SELECT 1 AS ok")) as unknown as [{ ok: number }[]];
  await conn.end();

  const server = /mariadb/i.test(`${row?.version} ${row?.comment}`) ? "MariaDB" : "MySQL";
  console.log(`Connected in ${Date.now() - started} ms`);
  console.log(`Server: ${server} ${row?.version} (${row?.comment})`);
  console.log(`Database selected: ${row?.db === process.env.DB_NAME ? "yes" : "NO"}`);
  console.log(`Round trip ok: ${timing?.ok === 1}`);
  console.log("Privileges on the database:");
  for (const g of grants) {
    const text = Object.values(g)[0] ?? "";
    const privs = /^GRANT (.+?) ON (.+?) TO/.exec(text);
    // Print only the privilege list and the target, not the user@host part.
    if (privs) console.log(`  ${privs[1]} ON ${privs[2]}`);
  }
} catch (err) {
  const e = err as { code?: string; errno?: number; message?: string };
  console.error(`Connection failed after ${Date.now() - started} ms: ${e.code ?? ""} ${e.errno ?? ""}`);
  console.error((e.message ?? String(err)).replace(process.env.DB_PASSWORD ?? "\u0000", "***"));
  process.exit(1);
}
