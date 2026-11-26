import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  buildingClassLabel,
  categoryLabel,
  dobJobLabel,
  inWindow,
  newYorkToday,
  sentenceCase,
  socrataCivilDate,
  stripCitations,
  usSlashDate,
  violationText,
} from "../src/dossier";

describe("stripCitations, with real HPD descriptions (task 2.3)", () => {
  it.each([
    [
      "§ 27-2005, 27-2007, 27-2041.1 HMC, §238, § 309; § 107 (2) ( C) MDL AND 28 RCNY §25-171: REPLACE OR REPAIR THE SELF-CLOSING DOORS THAT IS MISSING OR DEFECTIVE HINGES AT DOOR IN THE ENTRANCE LOCATED AT APT 2I, 2nd STORY",
      "REPLACE OR REPAIR THE SELF-CLOSING DOORS THAT IS MISSING OR DEFECTIVE HINGES AT DOOR IN THE ENTRANCE LOCATED AT APT 2I, 2nd STORY",
    ],
    [
      "§ 27-2005, 27-2007, 27-2041.1 HMC: REPLACE OR REPAIR THE SELF-CLOSING DOORS THAT IS MISSING OR DEFECTIVE IN THE ENTRANCE LOCATED AT APT 2F",
      "REPLACE OR REPAIR THE SELF-CLOSING DOORS THAT IS MISSING OR DEFECTIVE IN THE ENTRANCE LOCATED AT APT 2F",
    ],
    [
      "§ 27-2013 ADM CODE PAINT WITH LIGHT COLORED PAINT TO THE SATISFACTION OF THIS DEPARTMENT ALL WALLS AND CEILING. IN THE KITCHEN LOCATED AT APT 7",
      "PAINT WITH LIGHT COLORED PAINT TO THE SATISFACTION OF THIS DEPARTMENT ALL WALLS AND CEILING. IN THE KITCHEN LOCATED AT APT 7",
    ],
    [
      "§ 27-2045(B)(1)(B) HMC, § 12-06, § 12-07, § 12-09 RCNY REPAIR, REPLACE OR PROVIDE AN APPROVED AND OPERATIONAL CARBON MONOXIDE DETECTING DEVICE",
      "REPAIR, REPLACE OR PROVIDE AN APPROVED AND OPERATIONAL CARBON MONOXIDE DETECTING DEVICE",
    ],
    ["§ 27-2026, 2027 HMC: REPAIR THE LEAKY FAUCET AT BATHTUB", "REPAIR THE LEAKY FAUCET AT BATHTUB"],
    ["HMC ADM CODE: ABATE THE NUISANCE CONSISTING OF MICE", "ABATE THE NUISANCE CONSISTING OF MICE"],
    ["§ 27-2005, 2007 ADM CODE REPAIR THE BROKEN OR DEFECTIVE PLASTERED SURFACES", "REPAIR THE BROKEN OR DEFECTIVE PLASTERED SURFACES"],
    // Found by running 1,000 real descriptions through the first version:
    [
      "HMC ADM CODE: § 27-2017.4 ABATE THE INFESTATION CONSISTING OF MICE IN THE ENTIRE APARTMENT LOCATED AT APT 65",
      "ABATE THE INFESTATION CONSISTING OF MICE IN THE ENTIRE APARTMENT LOCATED AT APT 65",
    ],
    [
      "(A) § HMC:FILE ANNUAL BEDBUG REPORT IN ACCORDANCE WITH HPD RULE AS DESCRIBED ON THE BACK OF THIS NOTICE",
      "FILE ANNUAL BEDBUG REPORT IN ACCORDANCE WITH HPD RULE AS DESCRIBED ON THE BACK OF THIS NOTICE",
    ],
    [
      "28 RCNY § 25-171; & 67 (7)(B) MDL; NYC FIRE CODE § 703.1.3; NYC FIRE CODE § 703.2: ADJUST DOOR TO PREVENT GAPS",
      "ADJUST DOOR TO PREVENT GAPS",
    ],
  ])("%s", (input, expected) => {
    expect(stripCitations(input)).toBe(expected);
  });

  it("keeps an instruction that starts with a number after the citation", () => {
    expect(stripCitations("§ 27-2005 ADM CODE 2 WINDOWS ARE BROKEN")).toBe("2 WINDOWS ARE BROKEN");
    expect(stripCitations("§ 27-2005 HMC: 2 WINDOWS ARE BROKEN")).toBe("2 WINDOWS ARE BROKEN");
  });

  it("doesn't treat instruction words as citations after the colon", () => {
    expect(stripCitations("§ 27-2005 HMC: FIRE ESCAPE LADDER IS BROKEN")).toBe("FIRE ESCAPE LADDER IS BROKEN");
    expect(stripCitations("§ 27-2005 HMC: CODE REQUIRES A SELF-CLOSING DOOR")).toBe("CODE REQUIRES A SELF-CLOSING DOOR");
  });

  it("keeps times and other colons inside the instruction", () => {
    expect(stripCitations("§ 27-2029 HMC: PROVIDE HEAT BETWEEN 6:00 AM AND 10:00 PM")).toBe("PROVIDE HEAT BETWEEN 6:00 AM AND 10:00 PM");
  });

  it("returns text without a citation unchanged", () => {
    expect(stripCitations("  PROVIDE HEAT  ")).toBe("PROVIDE HEAT");
    expect(stripCitations("2 WINDOWS ARE BROKEN")).toBe("2 WINDOWS ARE BROKEN");
  });

  it("never returns an empty string for non-empty input, and never throws", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (s) => {
        const out = stripCitations(s);
        if (s.trim() !== "") expect(out.length).toBeGreaterThan(0);
        expect(s.trim()).toContain(out.split(" ")[0] ?? "");
      }),
    );
  });

  it("only removes a prefix: the result is a suffix of the input, up to spacing", () => {
    const words = fc.constantFrom("§", "27-2005", "HMC", "ADM", "CODE", ",", "AND", "RCNY", "REPAIR", "THE", "DOOR", "2", ":");
    fc.assert(
      fc.property(fc.array(words, { minLength: 1, maxLength: 12 }), (ws) => {
        const input = ws.join(" ");
        const squash = (s: string) => s.replace(/[\s,;:]+/g, "");
        expect(squash(input).endsWith(squash(stripCitations(input)))).toBe(true);
      }),
    );
  });
});

describe("sentenceCase and violationText", () => {
  it("lower-cases ALL-CAPS text but keeps words with digits", () => {
    expect(sentenceCase("REPAIR THE DOOR AT APT 2I, 2nd STORY")).toBe("Repair the door at apt 2I, 2nd story");
  });

  it("keeps acronyms and lower-cases ordinal suffixes", () => {
    expect(sentenceCase("NOV SENT OUT")).toBe("NOV sent out");
    expect(sentenceCase("NOTICE OF ISSUANCE SENT TO TENANT")).toBe("Notice of issuance sent to tenant");
    expect(sentenceCase("CIV14 MAILED")).toBe("CIV14 mailed");
    expect(sentenceCase("MORTAR AT 1ST STORY, HPD REQUEST")).toBe("Mortar at 1st story, HPD request");
    expect(sentenceCase("NOVEMBER")).toBe("November");
  });

  it("leaves mixed-case text alone", () => {
    expect(sentenceCase("Noise - Residential")).toBe("Noise - Residential");
  });

  it("combines both steps", () => {
    expect(violationText("§ 27-2017.3 HMC: TRACE AND REMEDY THE SOURCE OF MOLD")).toBe("Trace and remedy the source of mold");
  });
});

describe("labels (task 2.2)", () => {
  it("names building classes by their first letter", () => {
    expect(buildingClassLabel("D1")).toBe("Elevator apartment building");
    expect(buildingClassLabel("c4")).toBe("Walk-up apartment building");
    expect(buildingClassLabel("Q")).toBe("Outdoor recreation");
    expect(buildingClassLabel("")).toBeNull();
    expect(buildingClassLabel("9X")).toBeNull();
  });

  it("names DOB legacy job and work types, and keeps unknown codes visible", () => {
    expect(dobJobLabel("A2", "BL")).toBe("Alteration (several kinds of work): boiler");
    expect(dobJobLabel("A3", "EQ")).toBe("Minor alteration (one kind of work): construction equipment");
    expect(dobJobLabel("NB", null)).toBe("New building");
    expect(dobJobLabel("A2", "ZZ")).toBe("Alteration (several kinds of work): ZZ");
    expect(dobJobLabel("Alteration")).toBe("Alteration");
    expect(dobJobLabel("Alteration CO")).toBe("Alteration CO"); // DOB NOW's mixed-case values pass through
    expect(dobJobLabel(null)).toBe("Permit");
  });

  it("puts categories in sentence case", () => {
    expect(categoryLabel("HEAT/HOT WATER")).toBe("Heat/hot water");
    expect(categoryLabel("Illegal Parking")).toBe("Illegal Parking");
    expect(categoryLabel(null)).toBe("Other");
  });
});

describe("civil dates (task 2.4)", () => {
  it("reads Socrata timestamps and dates without a timezone shift", () => {
    expect(socrataCivilDate("2026-09-16T00:00:00.000")).toBe("2026-09-16");
    expect(socrataCivilDate("2018-02-14T15:51:50.000")).toBe("2018-02-14");
    expect(socrataCivilDate("2026-02-30T00:00:00.000")).toBeNull();
    expect(socrataCivilDate("16/09/2026")).toBeNull();
    expect(socrataCivilDate(null)).toBeNull();
  });

  it("reads DOB legacy MM/DD/YYYY dates", () => {
    expect(usSlashDate("12/06/2005")).toBe("2005-12-06");
    expect(usSlashDate("02/29/2024")).toBe("2024-02-29");
    expect(usSlashDate("02/29/2025")).toBeNull();
    expect(usSlashDate("2005-12-06")).toBeNull();
  });

  it("round-trips every real date through both formats", () => {
    fc.assert(
      fc.property(fc.date({ min: new Date("1900-01-01T00:00:00Z"), max: new Date("2100-12-31T00:00:00Z"), noInvalidDate: true }), (d) => {
        const ymd = d.toISOString().slice(0, 10);
        const [y, m, day] = ymd.split("-");
        expect(socrataCivilDate(`${ymd}T00:00:00.000`)).toBe(ymd);
        expect(usSlashDate(`${m}/${day}/${y}`)).toBe(ymd);
      }),
    );
  });

  it("never throws, and returns null or a YYYY-MM-DD", () => {
    fc.assert(
      fc.property(fc.anything(), (x) => {
        for (const r of [socrataCivilDate(x), usSlashDate(x)]) if (r !== null) expect(r).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }),
    );
  });

  it("checks windows inclusively", () => {
    const w = { start: "2023-11-25", end: "2026-11-25" };
    expect(inWindow("2023-11-25", w)).toBe(true);
    expect(inWindow("2026-11-25", w)).toBe(true);
    expect(inWindow("2023-11-24", w)).toBe(false);
    expect(inWindow(null, w)).toBe(false);
  });
});

describe("newYorkToday", () => {
  it("uses the New York date, not the UTC one", () => {
    expect(newYorkToday(new Date("2026-11-26T04:00:00Z"))).toBe("2026-11-25");
    expect(newYorkToday(new Date("2026-11-26T05:00:00Z"))).toBe("2026-11-26");
  });
});
