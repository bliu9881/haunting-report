import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { createRateLimiter } from "../lib/rate-limit";

describe("createRateLimiter (ai-summary Requirement 3.3)", () => {
  it("allows 20 calls a minute, then refuses until a minute has passed", () => {
    let t = 0;
    const rl = createRateLimiter({ perMinute: 20, perDay: 500, now: () => t });
    for (let i = 0; i < 20; i++) expect(rl.tryAcquire()).toBe(true);
    expect(rl.tryAcquire()).toBe(false);
    t += 59_999;
    expect(rl.tryAcquire()).toBe(false);
    t += 1;
    expect(rl.tryAcquire()).toBe(true);
  });

  it("allows 500 calls in a rolling day", () => {
    let t = 0;
    const rl = createRateLimiter({ perMinute: 20, perDay: 500, now: () => t });
    let accepted = 0;
    for (let i = 0; i < 2000; i++) {
      if (rl.tryAcquire()) accepted++;
      t += 60_000 / 20; // 20 a minute, as fast as allowed
    }
    expect(accepted).toBe(500);
    t += 24 * 3600_000;
    expect(rl.tryAcquire()).toBe(true);
  });

  it("never accepts more than the limits in any window, whatever the timing", () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 30_000 }), { maxLength: 300 }), (gaps) => {
        let t = 0;
        const rl = createRateLimiter({ perMinute: 5, perDay: 40, now: () => t });
        const accepted: number[] = [];
        for (const g of gaps) {
          t += g;
          if (rl.tryAcquire()) accepted.push(t);
        }
        for (const a of accepted) {
          expect(accepted.filter((x) => x > a - 60_000 && x <= a).length).toBeLessThanOrEqual(5);
          expect(accepted.filter((x) => x > a - 86_400_000 && x <= a).length).toBeLessThanOrEqual(40);
        }
      }),
    );
  });
});
