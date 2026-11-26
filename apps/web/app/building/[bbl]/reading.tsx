"use client";
// "The medium's reading": the AI summary (ai-summary design, "UI"; haunted-design v2).
import { useEffect, useState } from "react";

type Sentence = { text: string; sources: string[] };
type Payload = { kind: "ok"; sentences: Sentence[]; model: string } | { kind: "unavailable"; reason: string };

const SOURCE_NAMES: Record<string, string> = {
  ranking: "ranking",
  pluto: "building",
  violations: "violations",
  complaints: "complaints",
  service_requests: "311",
  evictions: "evictions",
  permits: "permits",
};

export function MediumsReading({ bbl, bin }: { bbl: string; bin: string | null }) {
  const [payload, setPayload] = useState<Payload | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/building/${bbl}/summary${bin ? `?bin=${bin}` : ""}`, { signal: controller.signal })
      .then((r) => r.json() as Promise<Payload>)
      .then(setPayload)
      .catch(() => {
        if (!controller.signal.aborted) setPayload({ kind: "unavailable", reason: "network" });
      });
    return () => controller.abort();
  }, [bbl, bin]);

  return (
    <section className="reading" id="section-reading" aria-busy={payload === null} aria-labelledby="reading-title">
      <h2 id="reading-title">The medium&apos;s reading</h2>
      {payload === null ? (
        <p className="consulting">The medium is reading the records…</p>
      ) : payload.kind === "unavailable" ? (
        <p className="ash">
          {payload.reason === "records_incomplete"
            ? "A reading needs the HPD violation and complaint records, and they didn't load this time. The entries below show what did."
            : "No reading is available for this building right now. The record below is unaffected."}
        </p>
      ) : (
        <>
          <ol>
            {payload.sentences.map((s, i) => (
              <li key={i}>
                {s.text}{" "}
                <span className="cite">
                  (
                  {s.sources.map((src, j) => (
                    <span key={src}>
                      {j > 0 && ", "}
                      <a href={`#section-${src}`}>{SOURCE_NAMES[src] ?? src}</a>
                    </span>
                  ))}
                  )
                </span>
              </li>
            ))}
          </ol>
          <p className="fine">
            Written by AI ({payload.model}) from the records on this page, then checked against them: a sentence with any number that
            isn&apos;t in the records is removed before you see it. Not legal advice.
          </p>
        </>
      )}
    </section>
  );
}
