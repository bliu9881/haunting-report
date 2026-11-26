/** Caps Gemini calls per server process (ai-summary Requirement 3.3). Pure apart from the injected clock. */

export interface RateLimiter {
  /** Records a call and returns true if it is within both limits; returns false and records nothing otherwise. */
  tryAcquire(): boolean;
}

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

export function createRateLimiter(opts: { perMinute: number; perDay: number; now?: () => number }): RateLimiter {
  if (!(opts.perMinute >= 1 && opts.perDay >= 1)) throw new RangeError("Limits must be at least 1");
  const now = opts.now ?? Date.now;
  // Timestamps of accepted calls in the last 24 hours, oldest first. At most perDay entries.
  const calls: number[] = [];
  return {
    tryAcquire() {
      const t = now();
      while (calls.length > 0 && (calls[0] as number) <= t - DAY) calls.shift();
      const lastMinute = calls.filter((c) => c > t - MINUTE).length;
      if (calls.length >= opts.perDay || lastMinute >= opts.perMinute) return false;
      calls.push(t);
      return true;
    },
  };
}
