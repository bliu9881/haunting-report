import { describe, expect, it } from "vitest";
import { cleanEnvValue, configFromEnv, describeHost, parseHost } from "../src";

const base = { DB_HOST: "127.0.0.1", DB_NAME: "u1_haunting", DB_USER: "u1_haunt_app", DB_PASSWORD: "pw" };

describe("DB_HOST as pasted into a dashboard", () => {
  it.each([
    ["127.0.0.1", "127.0.0.1", undefined],
    ['"127.0.0.1"', "127.0.0.1", undefined],
    ["'127.0.0.1'", "127.0.0.1", undefined],
    [" 127.0.0.1\n", "127.0.0.1", undefined],
    ["127.0.0.1:3306", "127.0.0.1", 3306],
    ["mysql://127.0.0.1:3307/u1_haunting", "127.0.0.1", 3307],
    ["srv123.hstgr.io", "srv123.hstgr.io", undefined],
    ["[::1]:3306", "::1", 3306],
  ])("%j → host %s, port %s", (raw, host, port) => {
    expect(parseHost(raw)).toEqual(port === undefined ? { host } : { host, port });
  });

  it.each([
    [undefined, "missing"],
    ["  ", "missing"],
    ['"127.0.0.1"', "ipv4"],
    ["localhost", "localhost"],
    ["::1", "ipv6"],
    ["srv123.hstgr.io", "hostname"],
    ["127.0.0.1 extra", "invalid"],
  ])("describeHost(%j) = %s", (raw, kind) => {
    expect(describeHost(raw)).toBe(kind);
  });
});

describe("configFromEnv", () => {
  it("cleans quotes and spaces from host, port, name and user, but leaves the password alone", () => {
    const c = configFromEnv({ DB_HOST: ' "127.0.0.1" ', DB_PORT: '"3306"', DB_NAME: " u1_haunting", DB_USER: "'u1_haunt_app'", DB_PASSWORD: " p w " });
    expect(c).toEqual({ host: "127.0.0.1", port: 3306, database: "u1_haunting", user: "u1_haunt_app", password: " p w " });
  });

  it("takes the port from DB_HOST when DB_PORT is not set, and prefers DB_PORT when it is", () => {
    expect(configFromEnv({ ...base, DB_HOST: "127.0.0.1:3307" }).port).toBe(3307);
    expect(configFromEnv({ ...base, DB_HOST: "127.0.0.1:3307", DB_PORT: "3306" }).port).toBe(3306);
    expect(configFromEnv(base).port).toBe(3306);
  });

  it("lists every missing or blank variable, without values", () => {
    expect(() => configFromEnv({ DB_HOST: '""', DB_NAME: "x" })).toThrow("Missing environment variables: DB_HOST, DB_USER, DB_PASSWORD");
  });

  it("rejects a bad port without printing it", () => {
    expect(() => configFromEnv({ ...base, DB_PORT: "abc" })).toThrow("DB_PORT is not a valid port number");
  });

  it("cleanEnvValue removes one matching pair of quotes only", () => {
    expect(cleanEnvValue(`"a"`)).toBe("a");
    expect(cleanEnvValue(`"a'`)).toBe(`"a'`);
    expect(cleanEnvValue(`""a""`)).toBe(`"a"`);
  });
});
