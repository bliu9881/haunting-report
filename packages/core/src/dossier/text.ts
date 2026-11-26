/** Plain-language text for the report (building-dossier tasks 2.2 and 2.3). Pure. */

// ---------- 2.3 violation descriptions ----------

type Tok = { text: string; kind: "section" | "number" | "paren" | "code" | "sep" | "colon" | "word" };

const CODE_WORDS = new Set(["HMC", "ADM", "CODE", "RCNY", "MDL", "NYC", "RCNY.", "ADM."]);

function classify(t: string): Tok["kind"] {
  if (/^§+$/.test(t)) return "section";
  if (/^§+\d/.test(t)) return "section"; // "§238", "§25-171": a section sign always marks a citation
  if (/^\d+(?:[-.]\d+)*(?:\([A-Za-z0-9 ]+\))*[.,;]?$/.test(t)) return "number"; // 27-2005, 27-2045(B)(1)(B), 2007
  if (/^(?:\(\s*[A-Za-z0-9]{1,3}\s*\))+[,;]?$/.test(t)) return "paren"; // (2), ( C), (7)(B)
  if (CODE_WORDS.has(t.toUpperCase().replace(/[,;:]$/, ""))) return "code";
  if (t === "," || t === ";" || t === "&" || t.toUpperCase() === "AND") return "sep";
  if (t === ":") return "colon";
  return "word";
}

function tokenize(s: string): Tok[] {
  // Split on spaces, and also split off a trailing comma, semicolon or colon so "HMC," and "HMC:" are two tokens.
  const raw = s
    .replace(/\(\s+/g, "(")
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((w) => {
      // "HMC:FILE" → "HMC", ":", "FILE" (no space after the colon). Only between letters, so times like 10:30 stay whole.
      const glued = /^(.*[A-Za-z)\]]):([A-Za-z].*)$/.exec(w);
      if (glued) return [glued[1] as string, ":", glued[2] as string];
      const m = /^(.*?)([,;:])$/.exec(w);
      return m && m[1] ? [m[1], m[2] as string] : [w];
    });
  return raw.map((text) => ({ text, kind: classify(text) }));
}

/**
 * Removes the legal citation block that starts most HPD violation texts, keeping the instruction.
 *   "§ 27-2005 HMC: REPLACE ..."                                   → "REPLACE ..."
 *   "§ 27-2013 ADM CODE PAINT WITH ..."                            → "PAINT WITH ..."
 *   "§ 27-2045(B)(1)(B) HMC, § 12-06, § 12-09 RCNY REPAIR ..."     → "REPAIR ..."
 * Numbers are only consumed where a citation allows them (after §, a separator or "AND"), so an
 * instruction that starts with a number survives. If nothing looks like a citation, or stripping
 * would leave nothing, the original text is returned trimmed.
 */
export function stripCitations(input: string): string {
  const original = input.trim();
  const toks = tokenize(original);
  let i = 0;
  let sawCitation = false;
  let prev: Tok["kind"] | "start" = "start";
  while (i < toks.length) {
    const t = toks[i] as Tok;
    // "NYC FIRE CODE", "BUILDING CODE": these words are citations only right before CODE.
    if (t.kind === "word" && /^(FIRE|BUILDING)$/i.test(t.text) && (toks[i + 1]?.text ?? "").toUpperCase() === "CODE") t.kind = "code";
    // After a colon only a section sign continues the citations ("HMC ADM CODE: § 27-2017.4 ABATE ...").
    if (prev === "colon" && t.kind !== "section") break;
    const allowed =
      t.kind === "section" ||
      t.kind === "colon" ||
      t.kind === "sep" ||
      t.kind === "code" ||
      t.kind === "paren" || // "(A) § HMC: ..." opens with a list marker
      (t.kind === "number" && (prev === "start" || prev === "section" || prev === "sep" || prev === "number" || prev === "paren"));
    if (!allowed) break;
    if (t.kind === "section" || t.kind === "code") sawCitation = true;
    i++;
    prev = t.kind;
  }
  if (!sawCitation || i === 0) return original;
  const rest = toks
    .slice(i)
    .map((t) => t.text)
    .join(" ")
    .replace(/\s+([,;:.])/g, "$1")
    .trim();
  return rest === "" ? original : rest;
}

/**
 * ALL-CAPS city text in sentence case. Words containing a digit keep their case ("APT 2I", "2nd").
 * Text that is not mostly upper case is returned unchanged.
 */
export function sentenceCase(input: string): string {
  const s = input.trim();
  const letters = s.replace(/[^A-Za-z]/g, "");
  if (letters.length === 0 || letters.replace(/[^A-Z]/g, "").length / letters.length < 0.8) return s;
  const lowered = s
    .split(/(\s+)/)
    .map((w) => (/\d/.test(w) ? w : w.toLowerCase()))
    .join("");
  return lowered.charAt(0).toUpperCase() + lowered.slice(1);
}

/** The text a renter sees for an HPD violation. */
export function violationText(novdescription: string): string {
  return sentenceCase(stripCitations(novdescription));
}

// ---------- 2.2 code labels ----------

/** PLUTO / DOF building class, by its first letter. */
const BUILDING_CLASS: Record<string, string> = {
  A: "One-family house",
  B: "Two-family house",
  C: "Walk-up apartment building",
  D: "Elevator apartment building",
  E: "Warehouse",
  F: "Factory or industrial building",
  G: "Garage or gas station",
  H: "Hotel",
  I: "Hospital or health facility",
  J: "Theater",
  K: "Store building",
  L: "Loft building",
  M: "Religious facility",
  N: "Group home or shelter",
  O: "Office building",
  P: "Public assembly or cultural building",
  Q: "Outdoor recreation",
  R: "Condominium",
  S: "Residence with stores or offices",
  T: "Transportation facility",
  U: "Utility",
  V: "Vacant land",
  W: "School or educational building",
  Y: "Government building",
  Z: "Miscellaneous",
};

export function buildingClassLabel(code: string | null): string | null {
  if (!code) return null;
  const c = code.trim().toUpperCase();
  return BUILDING_CLASS[c.charAt(0)] ?? null;
}

/** DOB legacy job types. DOB NOW already uses words ("Alteration", "New Building"). */
const DOB_JOB_TYPE: Record<string, string> = {
  A1: "Major alteration (changes use, exits or occupancy)",
  A2: "Alteration (several kinds of work)",
  A3: "Minor alteration (one kind of work)",
  NB: "New building",
  DM: "Demolition",
  SG: "Sign",
  PA: "Place of assembly",
  SC: "Subdivision (condo)",
  SI: "Subdivision (improved)",
  SU: "Subdivision (unimproved)",
};

/** DOB legacy work types. */
const DOB_WORK_TYPE: Record<string, string> = {
  PL: "plumbing",
  BL: "boiler",
  MH: "mechanical / heating",
  SP: "sprinklers",
  SD: "standpipe",
  FA: "fire alarm",
  FB: "fuel burning",
  FS: "fuel storage",
  EQ: "construction equipment",
  OT: "other work",
  CC: "curb cut",
  EA: "earthwork",
  FN: "fence",
  SH: "sidewalk shed",
  SF: "scaffold",
  "": "",
};

export function dobJobLabel(jobType: string | null, workType?: string | null): string {
  const j = (jobType ?? "").trim();
  const base = DOB_JOB_TYPE[j.toUpperCase()] ?? (j === "" ? "Permit" : sentenceCase(j));
  const w = (workType ?? "").trim().toUpperCase();
  const work = DOB_WORK_TYPE[w];
  if (w === "") return base;
  return `${base}: ${work === undefined || work === "" ? w : work}`;
}

/** HPD complaint categories and 311 types: "HEAT/HOT WATER" → "Heat/hot water"; mixed case kept. */
export function categoryLabel(x: string | null): string {
  const s = (x ?? "").trim();
  return s === "" ? "Other" : sentenceCase(s);
}
