import Link from "next/link";
import { notFound } from "next/navigation";
import { count, nyDate, score } from "@/lib/format";
import { buildingHref } from "@/lib/links";
import { lookupNeighborhood } from "@/lib/rankings";

export const dynamic = "force-dynamic";

const NTA_CODE = /^[A-Z]{2}\d{4}$/;

export default async function NeighborhoodPage({ params }: { params: Promise<{ nta: string }> }) {
  const code = decodeURIComponent((await params).nta).toUpperCase();
  if (!NTA_CODE.test(code)) notFound();
  const page = await lookupNeighborhood(code, 10);
  if (page.kind === "not_found") notFound();
  if (page.kind === "error") {
    return (
      <>
        <h1>Neighborhood</h1>
        <p className="muted">Neighborhood rankings are unavailable right now. Try again in a minute.</p>
      </>
    );
  }

  const { neighborhood: n, top, asOf } = page;
  return (
    <>
      <p className="small">
        <Link href="/">← Search an address</Link>
      </p>
      <h1>Most haunted buildings in {n.ntaName}</h1>
      <p className="muted">
        {count(n.count)} residential buildings with 3 or more apartments. Median score {score(n.medianScore)}.
      </p>
      {!n.ranked ? (
        <p className="muted">This neighborhood has too few comparable buildings (under 20) for a fair ranking.</p>
      ) : (
        <section className="panel">
          <table>
            <thead>
              <tr>
                <th className="num">Rank</th>
                <th>Address</th>
                <th className="num">Apts</th>
                <th className="num">C / B / A</th>
                <th className="num">Score</th>
              </tr>
            </thead>
            <tbody>
              {top.map((b) => (
                <tr key={b.bbl}>
                  <td className="num">{b.rank}</td>
                  <td>
                    <Link href={buildingHref(b.bbl, b.address)}>{b.address}</Link>
                  </td>
                  <td className="num">{count(b.unitsRes)}</td>
                  <td className="num">
                    {count(b.violations.c)} / {count(b.violations.b)} / {count(b.violations.a)}
                  </td>
                  <td className="num">{score(b.score)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      <p className="muted small">
        Score = (3 × class C + 2 × class B + 1 × class A) HPD violations over 36 months, divided by apartments. Small buildings can rank
        high from a few bad inspections, so check the counts.
        {asOf && <> Rankings refreshed {nyDate(asOf.publishedAt)}.</>}
      </p>
    </>
  );
}
