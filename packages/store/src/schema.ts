/** MariaDB 11.8 DDL. Table names take an optional prefix so integration tests never touch the live tables. */

export interface TableNames {
  buildingMetric: string;
  ntaSummary: string;
  rankingMeta: string;
  refreshRun: string;
}

const PREFIX = /^[a-z][a-z0-9_]{0,23}$/;

export function tableNames(prefix = ""): TableNames {
  // Prefixes are interpolated into SQL, so only a strict identifier shape is allowed.
  if (prefix !== "" && !PREFIX.test(prefix)) throw new TypeError(`Invalid table prefix: ${prefix}`);
  return {
    buildingMetric: `${prefix}building_metric`,
    ntaSummary: `${prefix}nta_summary`,
    rankingMeta: `${prefix}ranking_meta`,
    refreshRun: `${prefix}refresh_run`,
  };
}

/** The three tables that `publish` rebuilds as `*_next` and swaps in together. */
export function swappedTables(t: TableNames): string[] {
  return [t.buildingMetric, t.ntaSummary, t.rankingMeta];
}

const TABLE_OPTIONS = "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci";

export function createBuildingMetric(name: string, ifNotExists = false): string {
  return `CREATE TABLE ${ifNotExists ? "IF NOT EXISTS " : ""}\`${name}\` (
  bbl CHAR(10) NOT NULL,
  address VARCHAR(255) NOT NULL,
  units_res INT UNSIGNED NOT NULL,
  nta_code VARCHAR(8) NULL,
  nta_name VARCHAR(255) NULL,
  viol_a INT UNSIGNED NOT NULL,
  viol_b INT UNSIGNED NOT NULL,
  viol_c INT UNSIGNED NOT NULL,
  complaints INT UNSIGNED NOT NULL,
  evictions INT UNSIGNED NOT NULL,
  score DOUBLE NOT NULL,
  status VARCHAR(24) NOT NULL,
  nta_rank INT UNSIGNED NULL,
  nta_count INT UNSIGNED NULL,
  more_haunted_than DOUBLE NULL,
  PRIMARY KEY (bbl),
  KEY nta_score (nta_code, score DESC, bbl)
) ${TABLE_OPTIONS}`;
}

export function createNtaSummary(name: string, ifNotExists = false): string {
  return `CREATE TABLE ${ifNotExists ? "IF NOT EXISTS " : ""}\`${name}\` (
  nta_code VARCHAR(8) NOT NULL,
  nta_name VARCHAR(255) NOT NULL,
  borough CHAR(1) NOT NULL,
  building_count INT UNSIGNED NOT NULL,
  median_score DOUBLE NOT NULL,
  ranked TINYINT(1) NOT NULL,
  PRIMARY KEY (nta_code)
) ${TABLE_OPTIONS}`;
}

export function createRankingMeta(name: string, ifNotExists = false): string {
  return `CREATE TABLE ${ifNotExists ? "IF NOT EXISTS " : ""}\`${name}\` (
  id TINYINT UNSIGNED NOT NULL,
  run_id BIGINT UNSIGNED NOT NULL,
  formula_version VARCHAR(64) NOT NULL,
  window_start DATE NOT NULL,
  window_end DATE NOT NULL,
  source_as_of LONGTEXT NOT NULL,
  published_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id)
) ${TABLE_OPTIONS}`;
}

export function createRefreshRun(name: string): string {
  return `CREATE TABLE IF NOT EXISTS \`${name}\` (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  started_at DATETIME(3) NOT NULL,
  finished_at DATETIME(3) NULL,
  status VARCHAR(16) NOT NULL,
  formula_version VARCHAR(64) NOT NULL,
  window_start DATE NOT NULL,
  window_end DATE NOT NULL,
  source_as_of LONGTEXT NULL,
  row_counts LONGTEXT NULL,
  error TEXT NULL,
  PRIMARY KEY (id),
  KEY status_id (status, id)
) ${TABLE_OPTIONS}`;
}

export function createSwapped(t: TableNames, suffix: "" | "_next"): string[] {
  const ifNotExists = suffix === "";
  return [
    createBuildingMetric(t.buildingMetric + suffix, ifNotExists),
    createNtaSummary(t.ntaSummary + suffix, ifNotExists),
    createRankingMeta(t.rankingMeta + suffix, ifNotExists),
  ];
}

/** One atomic statement: live → _old, _next → live, for all three tables. */
export function swapStatement(t: TableNames): string {
  const pairs = swappedTables(t).flatMap((name) => [`\`${name}\` TO \`${name}_old\``, `\`${name}_next\` TO \`${name}\``]);
  return `RENAME TABLE ${pairs.join(", ")}`;
}

export function dropStatement(names: string[]): string {
  return `DROP TABLE IF EXISTS ${names.map((n) => `\`${n}\``).join(", ")}`;
}
