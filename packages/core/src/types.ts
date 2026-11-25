import type { FetchErrorReason } from "./http";

/** Canonical building identity. BBL is always a 10-digit string. BIN is 7 digits, or null when unknown. */
export interface BuildingId {
  bbl: string;
  bin: string | null;
}

export interface BblParts {
  /** "1" to "5" */
  borough: string;
  /** 5 digits, zero-padded */
  block: string;
  /** 4 digits, zero-padded */
  lot: string;
}

/**
 * The error variant every source returns (building-linker Requirement 5.5).
 * `source` names exactly one section of the report, so only that section is marked unavailable.
 */
export interface SourceError<S extends string = string> {
  kind: "error";
  source: S;
  reason: FetchErrorReason;
  /** Present when reason is "http". */
  status?: number;
  message: string;
}
