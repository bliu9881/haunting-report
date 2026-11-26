import type { SourceError } from "../types";

/** One report section per source (building-dossier D1). */
export const DOSSIER_SOURCES = ["pluto", "violations", "complaints", "service_requests", "evictions", "permits"] as const;
export type DossierSource = (typeof DOSSIER_SOURCES)[number];

/** Dataset ids behind each source, for "data as of" lines. */
export const DOSSIER_DATASETS: Record<DossierSource, readonly string[]> = {
  pluto: ["64uk-42ks"],
  violations: ["wvxf-dwi5"],
  complaints: ["ygpa-z7cr"],
  service_requests: ["erm2-nwe9"],
  evictions: ["6z8x-wfk4"],
  permits: ["ipu4-2q9a", "w9ak-ipjd"],
};

export interface DossierBuilding {
  /** 10-digit, normalized. */
  bbl: string;
  /** 7-digit, normalized; null when geosearch had none. */
  bin: string | null;
}

export type SectionResult<S extends DossierSource, T> =
  | { kind: "ok"; source: S; data: T; rowCount: number }
  | { kind: "not_applicable"; source: S; reason: string }
  | SourceError<S>;

export function isDossierSource(x: string): x is DossierSource {
  return (DOSSIER_SOURCES as readonly string[]).includes(x);
}
