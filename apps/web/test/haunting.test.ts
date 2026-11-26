import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { hauntingLevel } from "../lib/haunting";

describe("hauntingLevel (haunted-design Requirement 1)", () => {
  it.each([
    [0, 0, "Peaceful"],
    [0.49, 1, "Peaceful"],
    [0.5, 1, "Restless"],
    [0.75, 1, "Haunted"],
    [0.9089678510998308, 9.5, "Possessed"], // building A
    [0.98, 1, "Cursed"],
    [0.999, 166.8, "Cursed"],
  ])("p=%s, score=%s → %s", (p, s, name) => {
    expect(hauntingLevel(p, s).name).toBe(name);
  });

  it("a score of 0 is always Peaceful, whatever the share", () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 0.9999, noNaN: true }), (p) => {
        expect(hauntingLevel(p, 0).level).toBe(0);
      }),
    );
  });

  it("never goes down as the share goes up", () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 0.9999, noNaN: true }), fc.double({ min: 0, max: 0.9999, noNaN: true }), fc.double({ min: 0.01, max: 500, noNaN: true }), (x, y, s) => {
        const [lo, hi] = x <= y ? [x, y] : [y, x];
        expect(hauntingLevel(lo, s).level).toBeLessThanOrEqual(hauntingLevel(hi, s).level);
      }),
    );
  });

  it("maps every share in [0, 1) to exactly one of five levels, and never throws on bad input", () => {
    fc.assert(
      fc.property(fc.oneof(fc.double({ min: 0, max: 0.9999 }), fc.constant(Number.NaN), fc.constant(Infinity)), fc.double(), (p, s) => {
        const l = hauntingLevel(p, s);
        expect([0, 1, 2, 3, 4]).toContain(l.level);
        expect(l.name.length).toBeGreaterThan(0);
      }),
    );
  });
});
