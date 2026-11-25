import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { civilDate, nyDate, ordinal, percentFloor } from "../lib/format";
import { buildingHref } from "../lib/links";

describe("ordinal", () => {
  it.each([
    [1, "1st"], [2, "2nd"], [3, "3rd"], [4, "4th"], [11, "11th"], [12, "12th"], [13, "13th"],
    [21, "21st"], [111, "111th"], [266, "266th"], [1002, "1002nd"],
  ])("%i → %s", (n, s) => expect(ordinal(n)).toBe(s));
});

describe("percentFloor", () => {
  it("never rounds up to 100%", () => {
    expect(percentFloor(0.9999)).toBe("99%");
    expect(percentFloor(0.9089678510998308)).toBe("90%");
    expect(percentFloor(0)).toBe("0%");
  });

  it("never claims more than the share", () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 0.9999999, noNaN: true }), (x) => {
        expect(Number.parseInt(percentFloor(x), 10) / 100).toBeLessThanOrEqual(x);
      }),
    );
  });
});

describe("dates", () => {
  it("shows instants as New York dates", () => {
    expect(nyDate("2026-11-26T04:00:00Z")).toBe("Nov 25, 2026");
  });

  it("shows civil dates without a timezone shift", () => {
    expect(civilDate("2023-11-25")).toBe("Nov 25, 2023");
    expect(civilDate("2028-02-29")).toBe("Feb 29, 2028");
  });
});

describe("buildingHref", () => {
  it("encodes the address and query", () => {
    expect(buildingHref("3013610043", "1248 SAINT MARK'S AVENUE, Brooklyn", "1248 St Marks & Co")).toBe(
      "/building/3013610043?address=1248+SAINT+MARK%27S+AVENUE%2C+Brooklyn&q=1248+St+Marks+%26+Co",
    );
  });
});
