import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { publicErrorCode } = await import("../lib/rankings");

describe("publicErrorCode", () => {
  it("returns the driver's error code, never the message", () => {
    const err = Object.assign(new Error("Access denied for user 'u123_app'@'10.0.0.5' (using password: YES)"), {
      code: "ER_ACCESS_DENIED_ERROR",
    });
    expect(publicErrorCode(err)).toBe("ER_ACCESS_DENIED_ERROR");
  });

  it("passes through the names of missing variables, which contain no values", () => {
    expect(publicErrorCode(new Error("Missing environment variables: DB_HOST, DB_PASSWORD"))).toBe(
      "Missing environment variables: DB_HOST, DB_PASSWORD",
    );
  });

  it("hides anything that isn't a plain code", () => {
    expect(publicErrorCode(new Error("connect to db.example.com failed"))).toBe("UNKNOWN");
    expect(publicErrorCode(Object.assign(new Error("x"), { code: "secret value with spaces" }))).toBe("UNKNOWN");
    expect(publicErrorCode("boom")).toBe("UNKNOWN");
    expect(publicErrorCode(null)).toBe("UNKNOWN");
  });
});
