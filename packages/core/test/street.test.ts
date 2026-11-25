import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { isBlankStreet, streetMatches } from "../src/street";

describe("streetMatches examples (Req 1.11)", () => {
  it.each([
    ["St Marks Avenue", "SAINT MARK'S AVENUE"],
    ["St Marks Ave", "ST MARKS AVENUE"],
    ["St Felix St", "ST FELIX'S STREET"],
    ["E 88th St", "EAST 88 STREET"],
    ["88th St", "EAST 88 STREET"],
    ["88th St", "WEST 88 STREET"],
    ["88th St", "BEACH 88 STREET"],
    ["Broadway", "B'WAY"],
    ["Main St", "MAIN STREET"],
    ["Avenue A", "AVENUE A"],
    ["W. 4th St.", "WEST 4 STREET"],
  ])("%s matches %s", (q, c) => {
    expect(streetMatches(q, c)).toBe(true);
  });

  it.each([
    ["Fake Street", "ST FELIX STREET"],
    ["Fake Street", "GROSVENOR STREET"],
    ["E 88th St", "WEST 88 STREET"],
    ["E 88th St", "BEACH 88 STREET"],
    ["88th St", "89 STREET"],
    ["Avenue of the Americas", "6 AVENUE"],
  ])("%s does not match %s", (q, c) => {
    expect(streetMatches(q, c)).toBe(false);
  });

  it("treats a street that is only type words as blank", () => {
    expect(isBlankStreet("St")).toBe(true);
    expect(isBlankStreet("Avenue")).toBe(true);
    expect(isBlankStreet("Broadway")).toBe(false);
  });
});

const streetName = fc.oneof(
  fc.string(),
  fc
    .array(fc.constantFrom("East", "W", "88th", "St", "Saint", "Mark's", "Avenue", "Broadway", "B'way", "A", "of", "the"), {
      minLength: 1,
      maxLength: 5,
    })
    .map((ws) => ws.join(" ")),
);

describe("streetMatches properties", () => {
  it("every street matches itself", () => {
    fc.assert(
      fc.property(streetName, (s) => {
        expect(streetMatches(s, s)).toBe(true);
      }),
    );
  });

  it("letter case and punctuation do not change the result", () => {
    fc.assert(
      fc.property(streetName, streetName, (q, c) => {
        expect(streetMatches(q.toUpperCase(), c.toLowerCase())).toBe(streetMatches(q, c));
        expect(streetMatches(q.replace(/'/g, ""), `${c}.`)).toBe(streetMatches(q, c));
      }),
    );
  });

  it("adding a street-type word to either side does not change the result", () => {
    fc.assert(
      fc.property(streetName, streetName, fc.constantFrom("St", "Street", "Ave", "Avenue", "Place"), (q, c, w) => {
        expect(streetMatches(`${q} ${w}`, `${c} ${w.toUpperCase()}`)).toBe(streetMatches(q, c));
      }),
    );
  });

  it("never throws", () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (q, c) => {
        streetMatches(q, c);
      }),
    );
  });
});
