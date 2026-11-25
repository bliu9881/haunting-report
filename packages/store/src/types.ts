import type { BuildingMetric, NeighborhoodSummary } from "@haunting/core";

/** What the live ranking tables were built from. Swapped together with them, so the UI's "as of" always matches. */
export interface PublishedRanking {
  runId: number;
  formulaVersion: string;
  /** Civil dates `YYYY-MM-DD`. */
  windowStart: string;
  windowEnd: string;
  /** Source name → ISO instant of the dataset's last update. */
  sourceAsOf: Record<string, string>;
  /** ISO instant. */
  publishedAt: string;
}

export interface RankingSnapshot {
  buildings: readonly BuildingMetric[];
  neighborhoods: readonly NeighborhoodSummary[];
}

export type RunStatus = "running" | "succeeded" | "failed";

export interface RefreshRun {
  id: number;
  /** ISO instants. */
  startedAt: string;
  finishedAt: string | null;
  status: RunStatus;
  formulaVersion: string;
  windowStart: string;
  windowEnd: string;
  sourceAsOf: Record<string, string>;
  rowCounts: Record<string, number>;
  error: string | null;
}

export type NewRun = Pick<RefreshRun, "startedAt" | "formulaVersion" | "windowStart" | "windowEnd">;
export type RunOutcome = Pick<RefreshRun, "finishedAt" | "status" | "sourceAsOf" | "rowCounts" | "error">;

/** Largest page the neighborhood list may ask for. */
export const MAX_TOP = 50;

/**
 * Storage for neighborhood rankings (spec: neighborhood-rankings, Requirement 4.2 and 5).
 * `publish` replaces every ranking table at once, or changes nothing.
 */
export interface RankingStore {
  ensureSchema(): Promise<void>;

  publish(snapshot: RankingSnapshot, meta: Omit<PublishedRanking, "publishedAt">): Promise<PublishedRanking>;

  startRun(run: NewRun): Promise<number>;
  finishRun(id: number, outcome: RunOutcome): Promise<void>;
  /** The latest run with status "succeeded", for the shrink guard. */
  lastSuccessfulRun(): Promise<RefreshRun | null>;

  // Request path
  published(): Promise<PublishedRanking | null>;
  getBuilding(bbl: string): Promise<BuildingMetric | null>;
  getNeighborhood(ntaCode: string): Promise<NeighborhoodSummary | null>;
  /** Ranked buildings only, highest score first, ties by BBL. `limit` is 1 to MAX_TOP. */
  topInNeighborhood(ntaCode: string, limit: number): Promise<BuildingMetric[]>;

  close(): Promise<void>;
}
