import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { boroughCode, composeBbl, normalizeBbl, normalizeBin, parseBbl } from "../src/identifiers";

describe("examples from docs/data-sources.md", () => {
  it("normalizes PLUTO's float-string BBL (building B)", () => {
    expect(normalizeBbl("1015500031.00000000")).toBe("1015500031");
  });

  it("composes HPD complaint keys into building A's BBL", () => {
    expect(composeBbl("BROOKLYN", "1361", "43")).toBe("3013610043");
  });

  it("composes DOB zero-padded block and lot into building B's BBL", () => {
    expect(composeBbl("MANHATTAN", "01550", "00031")).toBe("1015500031");
  });

  it("accepts borough names in any case and as digits", () => {
    expect(boroughCode("brooklyn")).toBe("3");
    expect(boroughCode(" Staten Island ")).toBe("5");
    expect(boroughCode(4)).toBe("4");
    expect(boroughCode("6")).toBeNull();
    expect(boroughCode("Gotham")).toBeNull();
  });

  it("rejects BINs without a borough digit (Requirement 4.3)", () => {
    expect(normalizeBin("9999999")).toBeNull();
    expect(normalizeBin("0000000")).toBeNull();
    expect(normalizeBin("6123456")).toBeNull();
  });

  it("treats placeholder BINs as unknown", () => {
    expect(normalizeBin("3000000")).toBeNull();
    expect(normalizeBin("3036097")).toBe("3036097");
    expect(normalizeBin(1050055)).toBe("1050055");
  });

  it("rejects malformed input", () => {
    for (const bad of ["", "abc", "123", "0015500031", "6015500031", "1015500031.5", null, undefined, {}, -1, 1.5]) {
      expect(normalizeBbl(bad)).toBeNull();
    }
  });
});

const borough = fc.integer({ min: 1, max: 5 });
const block = fc.integer({ min: 0, max: 99999 });
const lot = fc.integer({ min: 0, max: 9999 });

describe("properties", () => {
  it("round trip: compose then parse returns the original triple (Req 2.3)", () => {
    fc.assert(
      fc.property(borough, block, lot, (b, bl, l) => {
        const bbl = composeBbl(b, bl, l);
        expect(bbl).not.toBeNull();
        const parts = parseBbl(bbl);
        expect(parts).toEqual({
          borough: String(b),
          block: String(bl).padStart(5, "0"),
          lot: String(l).padStart(4, "0"),
        });
      }),
    );
  });

  it("padded and unpadded block and lot give the same BBL (Req 3.2)", () => {
    fc.assert(
      fc.property(borough, block, lot, (b, bl, l) => {
        const unpadded = composeBbl(b, String(bl), String(l));
        const padded = composeBbl(b, String(bl).padStart(5, "0"), String(l).padStart(4, "0"));
        expect(unpadded).toBe(padded);
      }),
    );
  });

  it("normalizeBbl is idempotent (Req 2.4)", () => {
    fc.assert(
      fc.property(borough, block, lot, (b, bl, l) => {
        const once = normalizeBbl(composeBbl(b, bl, l));
        expect(once).not.toBeNull();
        expect(normalizeBbl(once)).toBe(once);
      }),
    );
  });

  it("number, digit string and float string forms of a BBL agree (Req 2.1)", () => {
    fc.assert(
      fc.property(borough, block, lot, (b, bl, l) => {
        const s = composeBbl(b, bl, l) as string;
        expect(normalizeBbl(Number(s))).toBe(s);
        expect(normalizeBbl(`${s}.00000000`)).toBe(s);
      }),
    );
  });

  it("never throws and only returns well-formed output on arbitrary input (Req 2.2, 4.1)", () => {
    fc.assert(
      fc.property(fc.anything(), (x) => {
        const bbl = normalizeBbl(x);
        if (bbl !== null) expect(bbl).toMatch(/^[1-5]\d{9}$/);
        const bin = normalizeBin(x);
        if (bin !== null) expect(bin).toMatch(/^[1-5]\d{6}$/);
        expect(() => composeBbl(x, x, x)).not.toThrow();
      }),
    );
  });

  it("unrecognized boroughs always give null (Req 3.3)", () => {
    fc.assert(
      fc.property(
        fc.string().filter((s) => boroughCode(s) === null),
        block,
        lot,
        (b, bl, l) => {
          expect(composeBbl(b, bl, l)).toBeNull();
        },
      ),
    );
  });

  it("placeholder BINs are always null (Req 4.2)", () => {
    for (const d of [1, 2, 3, 4, 5]) expect(normalizeBin(`${d}000000`)).toBeNull();
  });
});
