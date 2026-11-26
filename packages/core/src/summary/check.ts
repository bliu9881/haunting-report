/** Server-side check of the model's output (ai-summary Requirement 1.3, 1.4). Pure; never throws. */
import { SUMMARY_SECTIONS, type Facts, type SummarySection } from "./facts";

export const MAX_SENTENCES = 5;
export const MIN_SENTENCES = 2;

export interface CheckedSentence {
  text: string;
  sources: SummarySection[];
}

export type DropReason = "no_sources" | "source_not_loaded" | "unknown_number" | "advice" | "speculation" | "safety_claim" | "malformed";

export interface CheckResult {
  sentences: CheckedSentence[];
  dropped: { reason: DropReason; text: string; detail?: string }[];
  /** False when fewer than MIN_SENTENCES survive: show no summary. */
  usable: boolean;
}

const NUMBER_WORDS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
};

const ADVICE = /\b(you should|you shouldn't|we recommend|i recommend|recommended|avoid|don't rent|do not rent|consider (?:renting|moving|looking)|steer clear|think twice|beware)\b/i;
const SPECULATION = /\b(probably|likely|unlikely|perhaps|maybe|might be|may be because|suggests that|appears to be|seems to|could indicate|possibly)\b/i;
const SAFETY_CLAIM = /\b(safe|safety is|well[- ]kept|well[- ]maintained|good condition|good shape|clean record|no problems|no issues|problem[- ]free|trouble[- ]free)\b/i;

/** Numbers a sentence states: digits (with thousands separators, decimals, ordinals, percents) and number words. */
export function numbersIn(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(/\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g)) out.push(Number(m[0].replace(/,/g, "")));
  for (const m of text.toLowerCase().matchAll(/\b[a-z]+\b/g)) {
    const n = NUMBER_WORDS[m[0]];
    if (n !== undefined) out.push(n);
  }
  return out;
}

function sameNumber(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-9;
}

export function checkSummary(raw: unknown, facts: Facts): CheckResult {
  const dropped: CheckResult["dropped"] = [];
  const list = raw && typeof raw === "object" && Array.isArray((raw as { sentences?: unknown }).sentences) ? ((raw as { sentences: unknown[] }).sentences) : null;
  if (list === null) return { sentences: [], dropped: [{ reason: "malformed", text: "" }], usable: false };

  const known = [...facts.numbers];
  const kept: CheckedSentence[] = [];
  for (const item of list) {
    const text = item && typeof item === "object" && typeof (item as { text?: unknown }).text === "string" ? ((item as { text: string }).text.trim()) : "";
    const rawSources = item && typeof item === "object" && Array.isArray((item as { sources?: unknown }).sources) ? (item as { sources: unknown[] }).sources : [];
    if (text === "") {
      dropped.push({ reason: "malformed", text });
      continue;
    }
    const sources = [...new Set(rawSources.filter((s): s is SummarySection => typeof s === "string" && (SUMMARY_SECTIONS as readonly string[]).includes(s)))];
    if (sources.length === 0) {
      dropped.push({ reason: "no_sources", text });
      continue;
    }
    const missing = sources.find((s) => !facts.loaded.has(s));
    if (missing) {
      dropped.push({ reason: "source_not_loaded", text, detail: missing });
      continue;
    }
    const unknown = numbersIn(text).find((n) => !known.some((k) => sameNumber(k, n)));
    if (unknown !== undefined) {
      dropped.push({ reason: "unknown_number", text, detail: String(unknown) });
      continue;
    }
    if (ADVICE.test(text)) {
      dropped.push({ reason: "advice", text });
      continue;
    }
    if (SPECULATION.test(text)) {
      dropped.push({ reason: "speculation", text });
      continue;
    }
    if (SAFETY_CLAIM.test(text)) {
      dropped.push({ reason: "safety_claim", text });
      continue;
    }
    kept.push({ text, sources });
  }
  const sentences = kept.slice(0, MAX_SENTENCES);
  return { sentences, dropped, usable: sentences.length >= MIN_SENTENCES };
}
