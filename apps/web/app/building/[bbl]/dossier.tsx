"use client";
// The live sections of a building report (building-dossier task 5). Each section fetches its own JSON,
// so a slow or failing city dataset only affects its own frame.
import { useCallback, useEffect, useState } from "react";
import type { BuildingFacts, Complaints, Evictions, Permits, ServiceRequests, Violations } from "@haunting/core";
import { civilDate, count, nyDate } from "@/lib/format";

type Source = "pluto" | "violations" | "complaints" | "service_requests" | "evictions" | "permits";
type Payload =
  | { kind: "ok"; data: unknown; rowCount: number; asOf: Record<string, string>; window: { start: string; end: string } }
  | { kind: "not_applicable"; reason: string }
  | { kind: "error"; reason: string };
type State = { status: "loading" } | { status: "done"; payload: Payload };

const ORDER: Source[] = ["pluto", "violations", "complaints", "service_requests", "evictions", "permits"];
const TITLES: Record<Source, string> = {
  pluto: "Building facts",
  violations: "Open HPD violations (right now)",
  complaints: "HPD complaints",
  service_requests: "311 requests",
  evictions: "Evictions",
  permits: "Construction permits",
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
  // Requirement 2.4: both HPD sections answered, and both are empty.
  const noHousingRecords = v !== null && c !== null && v.rowCount === 0 && c.rowCount === 0;

  return (
    <div className="dossier">
      {noHousingRecords && (
        <div className="banner" role="status">
          <b>No housing records found for this lot.</b> HPD has no open violations and no complaints in the last 36 months. That
          doesn&apos;t mean the building is in good shape: it may not be a residential building HPD covers, or its records may be filed
          under a different lot.
        </div>
      )}
      {ORDER.map((s) => (
        <Section key={s} source={s} state={states[s]} onRetry={() => void load(s)} bin={bin} />
      ))}
    </div>
  );
}

const LABEL_SOURCES: Record<Source, string> = {
  pluto: "PLUTO",
  violations: "HPD",
  complaints: "HPD",
  service_requests: "311",
  evictions: "DOI",
  permits: "DOB",
};

function Section({ source, state, onRetry, bin }: { source: Source; state: State; onRetry: () => void; bin: string | null }) {
  const n = ORDER.indexOf(source) + 1;
  return (
    <section className="panel" aria-busy={state.status === "loading"}>
      <div className="panel-head">
        <h2>{TITLES[source]}</h2>
        <span className="label">
          Case file {n} of {ORDER.length} · {LABEL_SOURCES[source]}
        </span>
      </div>
      {state.status === "loading" ? (
        <p className="summoning">
          <span className="candle" aria-hidden /> Summoning the city&apos;s records…
        </p>
      ) : state.payload.kind === "error" ? (
        <p className="muted">
          This section is unavailable right now (the city&apos;s dataset didn&apos;t answer).{" "}
          <button type="button" className="link-button" onClick={onRetry}>
            Try again
          </button>
        </p>
      ) : state.payload.kind === "not_applicable" ? (
        <p className="muted">This section doesn&apos;t apply to this building.</p>
      ) : (
        <>
          <Body source={source} payload={state.payload} bin={bin} />
          <AsOf asOf={state.payload.asOf} />
        </>
      )}
    </section>
  );
}

function AsOf({ asOf }: { asOf: Record<string, string> }) {
  const parts = Object.entries(asOf).map(([id, iso]) => `${DATASET_NAMES[id] ?? id}, data as of ${nyDate(iso)}`);
  return parts.length === 0 ? null : <p className="muted small">Source: {parts.join(" · ")}.</p>;
}

type Ok = Extract<Payload, { kind: "ok" }>;

function Body({ source, payload, bin }: { source: Source; payload: Ok; bin: string | null }) {
  const since = civilDate(payload.window.start);
  switch (source) {
    case "pluto": {
      const d = payload.data as BuildingFacts | null;
      if (d === null) return <Empty>No PLUTO record for this lot. The city&apos;s land-use file may not list it yet.</Empty>;
      return (
        <div className="facts">
          <Fact value={d.yearBuilt ?? "Unknown"} label="Year built" />
          <Fact value={d.floors ?? "Unknown"} label="Floors" />
          <Fact value={d.unitsRes === null ? "Unknown" : count(d.unitsRes)} label="Apartments" />
          <Fact value={d.buildingClassLabel ?? d.buildingClass ?? "Unknown"} label={`Building class${d.buildingClass ? ` (${d.buildingClass})` : ""}`} text />
        </div>
      );
    }
    case "violations": {
      const d = payload.data as Violations;
      if (d.openTotal === 0) {
        return (
          <Empty>
            No open HPD violations. That can mean the building is well kept, that HPD doesn&apos;t inspect it (it isn&apos;t a rental
            residential building), or that its records are filed under another lot.
          </Empty>
        );
      }
      return (
        <>
          <div className="facts">
            <Fact value={count(d.open.c)} label="Class C (immediately hazardous)" tone="c" />
            <Fact value={count(d.open.b)} label="Class B (hazardous)" />
            <Fact value={count(d.open.a)} label="Class A (non-hazardous)" />
          </div>
          <h3>Most recent open violations</h3>
          <ul className="records">
            {d.recent.map((r) => (
              <li key={r.id}>
                <span className={`badge badge-${r.class.toLowerCase()}`}>{r.class}</span> {r.text}
                <div className="muted small">
                  Inspected {r.inspectedOn ? civilDate(r.inspectedOn) : "on an unknown date"}
                  {r.status ? ` · ${r.status}` : ""}
                  {r.rentImpairing ? " · Rent impairing" : ""}
                </div>
              </li>
            ))}
          </ul>
          {d.openTotal > d.recent.length && (
            <p className="muted small">
              Showing the {d.recent.length} most recent of {count(d.openTotal)} open violations.
            </p>
          )}
        </>
      );
    }
    case "complaints": {
      const d = payload.data as Complaints;
      if (d.byCategory.length === 0 && d.open === 0) {
        return <Empty>No HPD complaints since {since}. Tenants may not have complained, or HPD may not cover this building.</Empty>;
      }
      return (
        <>
          <p>
            {d.open === 0 ? "No complaints are open right now." : `${count(d.open)} complaint${d.open === 1 ? " is" : "s are"} open right now.`}
          </p>
          {d.byCategory.length > 0 && (
            <Bars
              caption={`Complaints since ${since}, by problem. One complaint can list several problems.`}
              rows={d.byCategory.map((x) => ({ label: x.label, value: x.count }))}
            />
          )}
        </>
      );
    }
    case "service_requests": {
      const d = payload.data as ServiceRequests;
      if (d.top.length === 0) return <Empty>No 311 requests for this lot since {since}.</Empty>;
      return <Bars caption={`Most common 311 requests since ${since}.`} rows={d.top.map((x) => ({ label: x.label, value: x.count }))} />;
    }
    case "evictions": {
      const d = payload.data as Evictions;
      if (d.total === 0) return <Empty>No residential evictions on record for this lot.</Empty>;
      return (
        <p>
          {d.inWindow === 0 ? "No residential evictions" : `${count(d.inWindow)} residential eviction${d.inWindow === 1 ? "" : "s"}`} since{" "}
          {since}. {d.mostRecent && <>The most recent on record was on {civilDate(d.mostRecent)}.</>}{" "}
          <span className="muted">({count(d.total)} on record in total.)</span>
        </p>
      );
    }
    case "permits": {
      const d = payload.data as Permits;
      const scope =
        d.scope === "building"
          ? `Covers this building only (BIN ${bin}); other buildings on the same lot aren't included.`
          : "Covers every building on this tax lot.";
      const SYSTEM_NAMES = { DOB: "older DOB permit database (permits issued mostly before 2021)", "DOB NOW": "DOB NOW permit system" };
      const missing = d.unavailable.length > 0 && (
        <p className="muted small">
          The {d.unavailable.map((x) => SYSTEM_NAMES[x]).join(" and the ")} didn&apos;t answer this time, so those permits are missing
          below. Reload the page to try again.
        </p>
      );
      if (d.total === 0) {
        return (
          <>
            {missing}
            <Empty>No DOB permits or filings on record.</Empty>
            <p className="muted small">{scope}</p>
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
                <div className="muted small">
                  {p.date ? civilDate(p.date) : "Date unknown"}
                  {p.status ? ` · ${p.status}` : ""} · {p.system}
                </div>
              </li>
            ))}
          </ul>
          <p className="muted small">
            {d.total > d.recent.length ? `Showing the ${d.recent.length} most recent of ${count(d.total)}. ` : ""}
            {scope}
          </p>
        </>
      );
    }
  }
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="muted">{children}</p>;
}

function Fact({ value, label, tone, text }: { value: React.ReactNode; label: string; tone?: "c"; text?: boolean }) {
  return (
    <div className={`fact${tone ? ` ${tone}` : ""}${text ? " text" : ""}`}>
      <b>{value}</b>
      <span>{label}</span>
    </div>
  );
}

function Bars({ caption, rows }: { caption: string; rows: { label: string; value: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <figure className="bars">
      <figcaption className="muted small">{caption}</figcaption>
      {rows.map((r) => (
        <div className="bar" key={r.label}>
          <span className="bar-label">{r.label}</span>
          <span className="bar-track">
            <span className="bar-fill" style={{ width: `${(r.value / max) * 100}%` }} />
          </span>
          <span className="bar-value">{count(r.value)}</span>
        </div>
      ))}
    </figure>
  );
}
