/**
 * Bounded JSON fetch shared by every upstream source (building-linker Requirement 5).
 * Never throws. Retries at most once, only after a network error or a 5xx.
 */

export type FetchErrorReason = "timeout" | "aborted" | "network" | "http" | "malformed";

export type FetchJsonResult =
  | { ok: true; body: unknown }
  | { ok: false; reason: FetchErrorReason; status?: number; message: string };

export interface FetchJsonOptions {
  fetch: typeof fetch;
  timeoutMs: number;
  /** Caller cancellation. An abort is never retried. */
  signal?: AbortSignal;
  headers?: Record<string, string>;
  /** Default GET. */
  method?: "GET" | "POST";
  body?: string;
  /** Extra attempts after a network error or 5xx. Default 1. */
  retries?: number;
  /** Pause before a retry. Default 250 ms; tests pass 0. */
  retryDelayMs?: number;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function fetchJson(url: string, opts: FetchJsonOptions): Promise<FetchJsonResult> {
  const attempts = 1 + Math.max(0, opts.retries ?? 1);
  let last: FetchJsonResult = { ok: false, reason: "network", message: "not attempted" };

  for (let attempt = 1; attempt <= attempts; attempt++) {
    if (attempt > 1) await sleep(opts.retryDelayMs ?? 250);
    if (opts.signal?.aborted) return { ok: false, reason: "aborted", message: "Aborted by caller" };

    const timeout = AbortSignal.timeout(opts.timeoutMs);
    const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;
    const stopped = (): FetchJsonResult | null => {
      if (opts.signal?.aborted) return { ok: false, reason: "aborted", message: "Aborted by caller" };
      if (timeout.aborted) return { ok: false, reason: "timeout", message: `Timed out after ${opts.timeoutMs} ms` };
      return null;
    };

    let res: Response;
    try {
      res = await opts.fetch(url, { signal, headers: opts.headers, method: opts.method ?? "GET", body: opts.body });
    } catch (err) {
      const s = stopped();
      if (s) return s;
      last = { ok: false, reason: "network", message: messageOf(err) };
      continue;
    }

    if (!res.ok) {
      last = { ok: false, reason: "http", status: res.status, message: `HTTP ${res.status}` };
      if (res.status >= 500) continue;
      return last;
    }

    try {
      return { ok: true, body: await res.json() };
    } catch (err) {
      return stopped() ?? { ok: false, reason: "malformed", message: `Invalid JSON: ${messageOf(err)}` };
    }
  }
  return last;
}
