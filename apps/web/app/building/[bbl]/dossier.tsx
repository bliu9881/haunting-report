"use client";
// The live entries of a building record (building-dossier task 5; haunted-design v2 B). Each entry fetches its
// own JSON, so a slow or failing city dataset only affects its own entry.
import { useCallback, useEffect, useState } from "react";
import type { BuildingFacts, Complaints, Evictions, Permits, ServiceRequests, Violations } from "@haunting/core";
import { civilDate, count, nyDate } from "@/lib/format";

type Source = "pluto" | "violations" | "complaints" | "service_requests" | "evictions" | "permits";
type Payload =
  | { kind: "ok"; data: unknown; rowCount: number; asOf: Record<string, string>; window: { start: string; end: string } }
  | { kind: "not_applicable"; reason: string }
  | { kind: "error"; reason: string };
type State = { status: "loading" } | { status: "done"; payload: Payload };

/** Reading order: what a renter needs first. Matches the index in record-index.tsx. */
const ORDER: Source[] = ["violations", "complaints", "service_requests", "evictions", "permits", "pluto"];
const TITLES: Record<Source, string> = {
  violations: "Open violations",
  complaints: "Complaints to HPD",
  service_requests: "311 requests",
  evictions: "Evictions",
  permits: "Permits",
  pluto: "The building",
};
const DATASET_NAMES: Record<string, string> = {
  "64uk-42ks": "PLUTO",
  "wvxf-dwi5": "HPD Housing Maintenance Code Violations",
  "ygpa-z7cr": "HPD Complaints and Problems",
  "erm2-nwe9": "311 Service Requests",
  "6z8x-wfk4": "Evictions",
  "ipu4-2q9a": "DOB Permit Issuance",
  "w9ak-ipjd": "DOB NOW: Build",
};
const SHOWN_VIOLATIONS = 5;

export function Dossier({ bbl, bin }: { bbl: string; bin: string | null }) {
  const [states, setStates] = useState<Record<Source, State>>(
    () => Object.fromEntries(ORDER.map((s) => [s, { status: "loading" }])) as Record<Source, State>,
  );

  const load = useCallback(
    async (source: Source, signal?: AbortSignal) => {
      setStates((s) => ({ ...s, [source]: { status: "loading" } }));
      let payload: Payload;
      try {
        const res = await fetch(`/api/building/${bbl}/${source}${bin ? `?bin=${bin}` : ""}`, { signal });
        payload = (await res.json()) as Payload;
        if (payload.kind !== "ok" && payload.kind !== "not_applicable") payload = { kind: "error", reason: "kind" in payload ? payload.reason : "http" };
      } catch (err) {
        if (signal?.aborted) return;
        payload = { kind: "error", reason: err instanceof Error ? err.name : "network" };
      }
      setStates((s) => ({ ...s, [source]: { status: "done", payload } }));
    },
    [bbl, bin],
  );

  useEffect(() => {
    const controller = new AbortController();
    for (const s of ORDER) void load(s, controller.signal);
    return () => controller.abort();
  }, [load]);

  const done = (s: Source) => {
    const st = states[s];
    return st.status === "done" && st.payload.kind === "ok" ? st.payload : null;
  };
  const v = done("violations");
  const c = done("complaints");
  // building-dossier Requirement 2.4: both HPD entries answered, and both are empty.
  const noHousingRecords = v !== null && c !== null && v.rowCount === 0 && c.rowCount === 0;

  return (
    <>
      {noHousingRecords && (
        <div className="notice" role="status">
          <b>No housing records on file for this lot</b>
          HPD has no open violations and no complaints from the last 36 months. That doesn&apos;t mean the building is in good shape:
          HPD may not cover it (it may not be a rental residential building), or its records may be filed under a different lot.
        </div>
      )}
      {ORDER.map((s) => (
        <Entry key={s} source={s} state={states[s]} onRetry={() => void load(s)} bin={bin} />
      ))}
    </>
  );
}

function Entry({ source, state, onRetry, bin }: { source: Source; state: State; onRetry: () => void; bin: string | null }) {
  return (
    <section className="entry" id={`section-${source}`} aria-busy={state.status === "loading"}>
      <h2>{TITLES[source]}</h2>
      {state.status === "loading" ? (
        <p className="consulting">Consulting the city&apos;s records…</p>
      ) : state.payload.kind === "error" ? (
        <p className="ash">
          The city&apos;s dataset didn&apos;t answer, so this entry is missing.{" "}
          <button type="button" className="retry" onClick={onRetry}>
            Ask again
          </button>
        </p>
      ) : state.payload.kind === "not_applicable" ? (
        <p className="ash">This entry doesn&apos;t apply to this building.</p>
      ) : (
        <>
          <Body source={source} payload={state.payload} bin={bin} />
          <Sources asOf={state.payload.asOf} />
        </>
      )}
    </section>
  );
}

function Sources({ asOf }: { asOf: Record<string, string> }) {
  const parts = Object.entries(asOf).map(([id, iso]) => `${DATASET_NAMES[id] ?? id}, data as of ${nyDate(iso)}`);
  return parts.length === 0 ? null : <p className="entry-source">From {parts.join("; ")}.</p>;
}

type Ok = Extract<Payload, { kind: "ok" }>;

function Body({ source, payload, bin }: { source: Source; payload: Ok; bin: string | null }) {
  const since = civilDate(payload.window.start);
  switch (source) {
    case "pluto": {
      const d = payload.data as BuildingFacts | null;
      if (d === null) return <p className="ash">The city&apos;s land-use file (PLUTO) has no record for this lot yet.</p>;
      const parts = [
        d.buildingClassLabel ? `${d.buildingClassLabel}${d.buildingClass ? ` (class ${d.buildingClass})` : ""}` : null,
        d.yearBuilt ? `built in ${d.yearBuilt}` : null,
        d.floors ? `${d.floors} floor${d.floors === 1 ? "" : "s"}` : null,
        d.unitsRes !== null ? `${count(d.unitsRes)} apartment${d.unitsRes === 1 ? "" : "s"}` : null,
      ].filter(Boolean);
      return <p className="measure">{parts.length > 0 ? `${parts.join(", ")}.` : "PLUTO lists this lot without building details."}</p>;
    }
    case "violations":
      return <ViolationsBody d={payload.data as Violations} />;
    case "complaints": {
      const d = payload.data as Complaints;
      if (d.byCategory.length === 0 && d.open === 0) {
        return <p className="ash measure">No complaints to HPD since {since}. Tenants may not have complained, or HPD may not cover this building.</p>;
      }
      return (
        <>
          <p>
            {d.open === 0 ? "None are open right now." : `${count(d.open)} ${d.open === 1 ? "is" : "are"} open right now.`} Since {since}, by
            problem (one complaint can name several):
          </p>
          <Tally rows={d.byCategory.map((x) => ({ label: x.label, value: x.count }))} />
        </>
      );
    }
    case "service_requests": {
      const d = payload.data as ServiceRequests;
      if (d.top.length === 0) return <p className="ash">No 311 requests for this lot since {since}.</p>;
      return (
        <>
          <p>The most common requests since {since}:</p>
          <Tally rows={d.top.map((x) => ({ label: x.label, value: x.count }))} />
        </>
      );
    }
    case "evictions": {
      const d = payload.data as Evictions;
      if (d.total === 0) return <p className="ash">No residential evictions on record for this lot.</p>;
      return (
        <p className="measure">
          {d.inWindow === 0 ? "No residential evictions" : `${count(d.inWindow)} residential eviction${d.inWindow === 1 ? "" : "s"}`} since{" "}
          {since}. {d.mostRecent && <>The most recent on record was on {civilDate(d.mostRecent)}. </>}
          <span className="ash">{count(d.total)} on record in total.</span>
        </p>
      );
    }
    case "permits": {
      const d = payload.data as Permits;
      const scope =
        d.scope === "building"
          ? `These cover this building only (BIN ${bin}); other buildings on the same lot aren't included.`
          : "These cover every building on this tax lot.";
      const SYSTEM_NAMES = { DOB: "older DOB permit database (permits issued mostly before 2021)", "DOB NOW": "DOB NOW permit system" };
      const missing = d.unavailable.length > 0 && (
        <p className="ash small">
          The {d.unavailable.map((x) => SYSTEM_NAMES[x]).join(" and the ")} didn&apos;t answer this time, so those permits are missing below.
          Reload the page to ask again.
        </p>
      );
      if (d.total === 0) {
        return (
          <>
            {missing}
            <p className="ash">No DOB permits or filings on record.</p>
            <p className="fine">{scope}</p>
          </>
        );
      }
      return (
        <>
          {missing}
          <ul className="records">
            {d.recent.map((p) => (
              <li key={`${p.system}-${p.id}-${p.date}-${p.label}`}>
                {p.label}
                <span className="meta">
                  {p.date ? civilDate(p.date) : "Date unknown"}
                  {p.status ? `, ${p.status.toLowerCase()}` : ""} ({p.system})
                </span>
              </li>
            ))}
          </ul>
          <p className="fine">
            {d.total > d.recent.length ? `The ${d.recent.length} most recent of ${count(d.total)}. ` : ""}
            {scope}
          </p>
        </>
      );
    }
  }
}

function ViolationsBody({ d }: { d: Violations }) {
  const [all, setAll] = useState(false);
  if (d.openTotal === 0) {
    return (
      <p className="ash measure">
        No open HPD violations. That can mean the building is well kept, that HPD doesn&apos;t inspect it (it isn&apos;t a rental residential
        building), or that its records are filed under another lot.
      </p>
    );
  }
  const shown = all ? d.recent : d.recent.slice(0, SHOWN_VIOLATIONS);
  return (
    <>
      <ul className="figures" aria-label="Open violations by class">
        <li className="c">
          <b>{count(d.open.c)}</b>
          <span>class C, immediately hazardous</span>
        </li>
        <li className="b">
          <b>{count(d.open.b)}</b>
          <span>class B, hazardous</span>
        </li>
        <li>
          <b>{count(d.open.a)}</b>
          <span>class A, non-hazardous</span>
        </li>
      </ul>
      <h3>The most recent</h3>
      <ul className="records" id="violation-list">
        {shown.map((r) => (
          <li key={r.id}>
            <span className={`class-mark ${r.class.toLowerCase()}`} aria-label={`Class ${r.class}`}>
              {r.class}
            </span>
            {r.text}
            <span className="meta">
              Inspected {r.inspectedOn ? civilDate(r.inspectedOn) : "on an unknown date"}
              {r.status ? `; ${r.status.replace(/^NOV\b/, "notice of violation")}` : ""}
              {r.rentImpairing ? "; rent impairing" : ""}
            </span>
          </li>
        ))}
      </ul>
      {!all && d.recent.length > SHOWN_VIOLATIONS && (
        <button type="button" className="more" aria-controls="violation-list" onClick={() => setAll(true)}>
          Show all {d.recent.length}
        </button>
      )}
      {d.openTotal > d.recent.length && (all || d.recent.length <= SHOWN_VIOLATIONS) && (
        <p className="fine">
          The {d.recent.length} most recent of {count(d.openTotal)} open violations.
        </p>
      )}
    </>
  );
}

function Tally({ rows }: { rows: { label: string; value: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="tally">
      {rows.map((r) => (
        <li key={r.label}>
          <span>{r.label}</span>
          <span className="n">{count(r.value)}</span>
          <span className="bar" style={{ ["--w" as string]: `${(r.value / max) * 100}%` }} aria-hidden />
        </li>
      ))}
    </ul>
  );
}
