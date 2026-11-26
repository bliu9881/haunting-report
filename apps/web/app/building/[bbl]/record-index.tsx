"use client";
// The index of sections beside the record; marks the one in view (haunted-design v2 B.2).
import { useEffect, useState } from "react";

export const ENTRIES = [
  ["ranking", "Among its neighbors"],
  ["reading", "The medium's reading"],
  ["violations", "Open violations"],
  ["complaints", "Complaints"],
  ["service_requests", "311 requests"],
  ["evictions", "Evictions"],
  ["permits", "Permits"],
  ["pluto", "The building"],
] as const;

export function RecordIndex() {
  const [current, setCurrent] = useState<string>("ranking");

  useEffect(() => {
    const seen = new Map<string, number>();
    const io = new IntersectionObserver(
      (items) => {
        for (const it of items) seen.set(it.target.id, it.isIntersecting ? it.boundingClientRect.top : Number.POSITIVE_INFINITY);
        const first = [...seen.entries()].filter(([, top]) => Number.isFinite(top)).sort((a, b) => a[1] - b[1])[0];
        if (first) setCurrent(first[0].replace(/^section-/, ""));
      },
      { rootMargin: "-10% 0px -55% 0px" },
    );
    for (const [id] of ENTRIES) {
      const el = document.getElementById(`section-${id}`);
      if (el) io.observe(el);
    }
    return () => io.disconnect();
  }, []);

  return (
    <nav className="index" aria-label="Sections of this record">
      <ol>
        {ENTRIES.map(([id, label]) => (
          <li key={id}>
            <a href={`#section-${id}`} aria-current={current === id ? "true" : undefined}>
              {label}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
