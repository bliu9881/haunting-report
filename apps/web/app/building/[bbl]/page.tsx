import Link from "next/link";
import { Fell } from "@/app/components/fell";
import { notFound } from "next/navigation";
import { normalizeBbl, normalizeBin } from "@haunting/core";
import type { NotRankableReason, PublishedRanking, RankingLookup } from "@haunting/store";
import { civilDate, count, nyDate, ordinal, percentFloor, score, SOURCE_LABELS } from "@/lib/format";
import { neighborhoodHref } from "@/lib/links";
import { lookupRanking } from "@/lib/rankings";
import { SpiritBoard } from "../../components/spirit-board";
import { Dossier } from "./dossier";
import { RecordIndex } from "./record-index";
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
  const title = (address ?? stored?.address ?? `Building ${bbl}`).replace(/, NY, USA$/, "");

  return (
    <div className="record">
      <RecordIndex />
      <header className="record-head">
        <Link className="back" href={q ? `/?q=${encodeURIComponent(q)}` : "/"}>
          Not this building? Search again
        </Link>
        <h1>
          <Fell>{title}</Fell>
        </h1>
        <p className="ids">
          Tax lot (BBL) {bbl}
          {bin ? `, building number (BIN) ${bin}` : ""}
        </p>
      </header>
      <div className="record-body">
        <RankingSection ranking={ranking} />
        <MediumsReading bbl={bbl} bin={bin} address={title} />
        <Dossier bbl={bbl} bin={bin} />
      </div>
    </div>
  );
}

function RankingSection({ ranking }: { ranking: RankingLookup }) {
  if (ranking.kind === "error") {
    return (
      <section className="entry" id="section-ranking">
        <h2>Among its neighbors</h2>
        <p className="ash">Neighborhood rankings are unavailable right now. The rest of the record is unaffected.</p>
      </section>
    );
  }
  if (ranking.kind === "not_rankable") {
    return (
      <section className="entry" id="section-ranking">
        <h2>Among its neighbors</h2>
        <p className="ash measure">{NOT_RANKABLE[ranking.reason]}</p>
        {ranking.building && <Counts b={ranking.building} />}
        {ranking.asOf && <AsOf asOf={ranking.asOf} />}
      </section>
    );
  }
  const b = ranking.building;
  return (
    <section className="entry" id="section-ranking">
      <h2>Among its neighbors</h2>
      <SpiritBoard moreHauntedThan={b.moreHauntedThan} score={b.score} />
      <p className="rank-line">
        <Fell>{`${ordinal(b.rank)} most haunted of ${count(b.neighborhoodCount)} buildings in `}</Fell>
        <Link href={neighborhoodHref(b.ntaCode)}>{b.ntaName}</Link>
      </p>
      <p className="rank-meaning">
        More haunted than {percentFloor(b.moreHauntedThan)} of its neighbors. Score {score(b.score)}
        {ranking.neighborhoodMedian !== null && <>, against a neighborhood median of {score(ranking.neighborhoodMedian)}</>}.
      </p>
      <Counts b={b} />
      <p className="fine measure">
        Score = (3 × class C + 2 × class B + 1 × class A) HPD violations from {civilDate(ranking.asOf.windowStart)} to{" "}
        {civilDate(ranking.asOf.windowEnd)}, divided by {count(b.unitsRes)} apartments. Complaints and evictions are shown, not scored.
      </p>
      <AsOf asOf={ranking.asOf} />
    </section>
  );
}

/** Counts over the ranking window, open or closed. The violations entry below lists only the open ones. */
function Counts({ b }: { b: { violations: { a: number; b: number; c: number }; complaints: number; evictions: number } }) {
  return (
    <>
      <p className="figures-caption">In the last 36 months, open and closed:</p>
      <ul className="figures">
        <li className="c">
          <b>{count(b.violations.c)}</b>
          <span>class C violations</span>
        </li>
        <li className="b">
          <b>{count(b.violations.b)}</b>
          <span>class B violations</span>
        </li>
        <li>
          <b>{count(b.violations.a)}</b>
          <span>class A violations</span>
        </li>
        <li>
          <b>{count(b.complaints)}</b>
          <span>HPD complaints</span>
        </li>
        <li>
          <b>{count(b.evictions)}</b>
          <span>evictions</span>
        </li>
      </ul>
    </>
  );
}

function AsOf({ asOf }: { asOf: PublishedRanking }) {
  const parts = Object.entries(SOURCE_LABELS)
    .filter(([key]) => asOf.sourceAsOf[key])
    .map(([key, label]) => `${label} ${nyDate(asOf.sourceAsOf[key] as string)}`);
  return (
    <p className="entry-source">
      Rankings refreshed {nyDate(asOf.publishedAt)}. Data as of: {parts.join("; ")}.
    </p>
  );
}
