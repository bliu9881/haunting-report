"use client";
// "The medium's reading": the AI summary panel (ai-summary design, "UI").
import { useEffect, useState } from "react";

type Sentence = { text: string; sources: string[] };
type Payload = { kind: "ok"; sentences: Sentence[]; model: string } | { kind: "unavailable"; reason: string };

const SOURCE_NAMES: Record<string, string> = {
  ranking: "Ranking",
  pluto: "Building facts",
  violations: "Violations",
  complaints: "Complaints",
  service_requests: "311",
  evictions: "Evictions",
  permits: "Permits",
};

export function MediumsReading({ bbl, bin, address }: { bbl: string; bin: string | null; address: string }) {
  const [payload, setPayload] = useState<Payload | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ address });
    if (bin) params.set("bin", bin);
    fetch(`/api/building/${bbl}/summary?${params}`, { signal: controller.signal })
      .then((r) => r.json() as Promise<Payload>)
      .then(setPayload)
      .catch(() => {
        if (!controller.signal.aborted) setPayload({ kind: "unavailable", reason: "network" });
      });
    return () => controller.abort();
  }, [bbl, bin, address]);

  return (
    <section className="panel reading" aria-busy={payload === null} aria-labelledby="reading-title">
      <div className="panel-head">
        <h2 id="reading-title" className="reading-title">
          The medium&apos;s reading
        </h2>
        <span className="label">AI summary</span>
      </div>
      {payload === null ? (
        <p className="summoning">
          <span className="candle" aria-hidden /> The medium is reading the records…
        </p>
      ) : payload.kind === "unavailable" ? (
        <p className="muted">
          {payload.reason === "records_incomplete"
            ? "A reading needs the HPD violation and complaint records, and they didn't load this time. The sections below show what did."
            : "No reading is available for this building right now. The records below are unaffected."}
        </p>
      ) : (
        <>
          <ul className="reading-list">
            {payload.sentences.map((s, i) => (
              <li key={i}>
                {s.text}{" "}
                {s.sources.map((src) => (
                  <a key={src} className="source-chip" href={`#section-${src}`}>
                    {SOURCE_NAMES[src] ?? src}
                  </a>
                ))}
              </li>
            ))}
          </ul>
          <p className="muted small">
            Written by AI ({payload.model}) from the records on this page, and checked against them before it is shown: any
            sentence with a number that isn&apos;t in the records is removed. Not legal advice.
          </p>
        </>
      )}
    </section>
  );
}
