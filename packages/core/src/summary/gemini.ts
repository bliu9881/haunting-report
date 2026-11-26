/** Gemini call for the summary (ai-summary Requirement 3, design "Gemini call"). Never throws on I/O. */
import { fetchJson } from "../http";
import type { SourceError } from "../types";
import { MAX_SENTENCES, MIN_SENTENCES } from "./check";
import { SUMMARY_SECTIONS, type Facts } from "./facts";

export const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";
export const GEMINI_TIMEOUT_MS = 15_000;
const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export const SYSTEM_INSTRUCTION = [
  "You write a short, neutral reading of New York City building records for someone deciding whether to rent there.",
  "Rules:",
  "- Use only the facts in the JSON you are given. Never add numbers, dates, causes or comparisons that aren't in it, and never add numbers together.",
  "- A key that is missing means that record didn't load. Don't mention it and don't guess.",
  "- Keep \"open right now\" counts separate from counts \"in the period\" (the last 36 months). Never put them in the same clause.",
  "- Name violation classes exactly: class C is \"immediately hazardous\", class B \"hazardous\", class A \"non-hazardous\". Never call a mix of classes hazardous.",
  "- For the ranking, say \"more haunted than N% of its neighbors\" and \"ranked R of T in <neighborhood>\". Never say \"higher\", \"lower\", \"better\" or \"worse\" about a rank.",
  "- No advice, no recommendations, no speculation about causes. Never call the building safe, well kept, or free of problems, even when records are empty; say the records are empty.",
  "- No people's names and no apartment numbers.",
  "- Plain, factual English. No spooky words.",
  `- Write ${MIN_SENTENCES} to ${MAX_SENTENCES} sentences, most important first: (1) the ranking; (2) the open class C and class B violation counts, by name, with one recent example, phrased as what the inspector ordered the landlord to do ("one recent order was to repair the ..."); (3) the most common complaint problem in the period with its count, and how many complaints are open right now; (4) evictions, if any in the period; (5) anything else notable.`,
  "- For every sentence, list the ids of the sections whose facts it uses.",
].join("\n");

export const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    sentences: {
      type: "ARRAY",
      minItems: MIN_SENTENCES,
      maxItems: MAX_SENTENCES,
      items: {
        type: "OBJECT",
        properties: {
          text: { type: "STRING" },
          sources: { type: "ARRAY", minItems: 1, items: { type: "STRING", enum: [...SUMMARY_SECTIONS] } },
        },
        required: ["text", "sources"],
      },
    },
  },
  required: ["sentences"],
} as const;

export interface GeminiOptions {
  apiKey: string;
  model?: string;
  fetch: typeof fetch;
  timeoutMs?: number;
  retryDelayMs?: number;
}

export type GeminiResult = { kind: "ok"; raw: unknown; model: string; usage: unknown } | SourceError<"summary">;

/** Parts marked `thought` are the model's hidden reasoning and are not part of the answer. */
function answerText(body: unknown): string | null {
  const parts = (body as { candidates?: { content?: { parts?: { text?: unknown; thought?: unknown }[] } }[] })?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return null;
  const text = parts.filter((p) => p && p.thought !== true && typeof p.text === "string").map((p) => p.text as string).join("");
  return text.trim() === "" ? null : text;
}

export async function callGemini(facts: Facts, opts: GeminiOptions): Promise<GeminiResult> {
  const model = opts.model?.trim() || DEFAULT_GEMINI_MODEL;
  if (!/^[a-z0-9.-]+$/.test(model)) return { kind: "error", source: "summary", reason: "malformed", message: "Invalid model name" };
  const res = await fetchJson(`${BASE}/${model}:generateContent`, {
    fetch: opts.fetch,
    timeoutMs: opts.timeoutMs ?? GEMINI_TIMEOUT_MS,
    retryDelayMs: opts.retryDelayMs,
    method: "POST",
    // The key goes in a header, never the URL, so it can't end up in logs (Requirement 3.5).
    headers: { "content-type": "application/json", "x-goog-api-key": opts.apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
      contents: [{ role: "user", parts: [{ text: `Building records (JSON):\n${JSON.stringify(facts.json)}` }] }],
      generationConfig: { responseMimeType: "application/json", responseSchema: RESPONSE_SCHEMA },
    }),
  });
  if (!res.ok) {
    const { reason, status, message } = res;
    return { kind: "error", source: "summary", reason, message, ...(status === undefined ? {} : { status }) };
  }
  const text = answerText(res.body);
  if (text === null) return { kind: "error", source: "summary", reason: "malformed", message: "No answer text (blocked or empty)" };
  try {
    return { kind: "ok", raw: JSON.parse(text), model, usage: (res.body as { usageMetadata?: unknown }).usageMetadata ?? null };
  } catch {
    return { kind: "error", source: "summary", reason: "malformed", message: "Answer was not JSON" };
  }
}
