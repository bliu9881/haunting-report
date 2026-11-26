import Link from "next/link";
import { notFound } from "next/navigation";
import { normalizeBbl, normalizeBin } from "@haunting/core";
import type { NotRankableReason, PublishedRanking, RankingLookup } from "@haunting/store";
import { civilDate, count, nyDate, ordinal, percentFloor, score, SOURCE_LABELS } from "@/lib/format";
import { neighborhoodHref } from "@/lib/links";
import { lookupRanking } from "@/lib/rankings";
import { HauntMeter } from "../../components/haunt-meter";
import { Dossier } from "./dossier";
import { MediumsReading } from "./reading";

export const dynamic = "force-dynamic";

const NOT_RANKABLE: Record<NotRankableReason, string> = {
  no_rankings_yet: "Neighborhood rankings haven't been built yet.",
  not_in_rankings: "Rankings cover residential buildings with 3 or more apartments, so this building isn't ranked.",
  small_neighborhood: "This neighborhood has too few comparable buildings (under 20) for a fair ranking.",
  non_residential_nta: "This building is in a mostly non-residential area (a park, airport or similar), so it isn't ranked.",
  no_tract: "City records don't place this building in a census tract, so we can't tell which neighborhood to compare it with.",
  unknown_tract: "We couldn't match this building's census tract to a neighborhood.",
};

export default async function BuildingPage({
  params,
  searchParams,
}: {
  params: Promise<{ bbl: string }>;
  searchParams: Promise<{ address?: string; q?: string; bin?: string }>;
}) {
  const bbl = normalizeBbl((await params).bbl);
  if (bbl === null) notFound();
  const { address, q, bin: rawBin } = await searchParams;
  const bin = rawBin ? normalizeBin(rawBin) : null;
  const ranking = await lookupRanking(bbl);
  const stored = ranking.kind === "error" ? null : ranking.building;
  const title = address ?? stored?.address ?? `Building ${bbl}`;

  return (
    <>
      <p className="small">
        <Link href={q ? `/?q=${encodeURIComponent(q)}` : "/"}>Not this building? Search again</Link>
      </p>
      <h1 className="address">{title}</h1>
      <p className="muted small">
        BBL {bbl}
        {bin ? ` · BIN ${bin}` : ""}
      </p>
      <MediumsReading bbl={bbl} bin={bin} address={title} />
      <RankingSection ranking={ranking} />
      <Dossier bbl={bbl} bin={bin} />
    </>
  );
}

function RankingSection({ ranking }: { ranking: RankingLookup }) {
  if (ranking.kind === "error") {
    return (
      <section className="panel" id="section-ranking">
        <h2>Neighborhood ranking</h2>
        <p className="muted">Neighborhood rankings are unavailable right now. The rest of the report is unaffected.</p>
      </section>
    );
  }
  if (ranking.kind === "not_rankable") {
    return (
      <section className="panel" id="section-ranking">
        <h2>Neighborhood ranking</h2>
        <p className="muted">{NOT_RANKABLE[ranking.reason]}</p>
        {ranking.building && <Counts b={ranking.building} />}
        {ranking.asOf && <AsOf asOf={ranking.asOf} />}
      </section>
    );
  }
  const b = ranking.building;
  return (
    <section className="panel" id="section-ranking">
      <div className="panel-head">
        <h2>Neighborhood ranking</h2>
        <span className="label">Case summary</span>
      </div>
      <div className="big">
        {ordinal(b.rank)} most haunted <span className="of">of {count(b.neighborhoodCount)} buildings in </span>
        <Link href={neighborhoodHref(b.ntaCode)}>{b.ntaName}</Link>
      </div>
      <HauntMeter moreHauntedThan={b.moreHauntedThan} score={b.score} />
      <p>
        More haunted than {percentFloor(b.moreHauntedThan)} of its neighbors. Score {score(b.score)}
        {ranking.neighborhoodMedian !== null && <> against a neighborhood median of {score(ranking.neighborhoodMedian)}</>}.
      </p>
      <Counts b={b} />
      <p className="muted small">
        These counts include closed violations; the section below lists the ones still open. Score = (3 × class C + 2 × class B + 1 ×
        class A) HPD violations from {civilDate(ranking.asOf.windowStart)} to{" "}
        {civilDate(ranking.asOf.windowEnd)}, divided by {count(b.unitsRes)} apartments. Complaints and evictions are shown, not scored.
      </p>
      <AsOf asOf={ranking.asOf} />
    </section>
  );
}

/** Counts over the ranking window, open or closed. The live violations section below shows only open ones. */
function Counts({ b }: { b: { violations: { a: number; b: number; c: number }; complaints: number; evictions: number; unitsRes: number } }) {
  return (
    <>
      <p className="label counts-caption">Last 36 months, open and closed</p>
      <div className="facts facts-5">
        <div className="fact c">
          <b>{count(b.violations.c)}</b>
          <span>Class C violations</span>
        </div>
        <div className="fact">
          <b>{count(b.violations.b)}</b>
          <span>Class B violations</span>
        </div>
        <div className="fact">
          <b>{count(b.violations.a)}</b>
          <span>Class A violations</span>
        </div>
        <div className="fact">
          <b>{count(b.complaints)}</b>
          <span>HPD complaints</span>
        </div>
        <div className="fact">
          <b>{count(b.evictions)}</b>
          <span>Evictions</span>
        </div>
      </div>
    </>
  );
}

function AsOf({ asOf }: { asOf: PublishedRanking }) {
  const parts = Object.entries(SOURCE_LABELS)
    .filter(([key]) => asOf.sourceAsOf[key])
    .map(([key, label]) => `${label} as of ${nyDate(asOf.sourceAsOf[key] as string)}`);
  return (
    <p className="muted small">
      Rankings refreshed {nyDate(asOf.publishedAt)}. {parts.join(" · ")}.
    </p>
  );
}
