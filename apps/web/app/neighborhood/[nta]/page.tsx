import Link from "next/link";
import { Fell } from "@/app/components/fell";
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
        <h1>This neighborhood</h1>
        <p className="ash">The neighborhood rankings didn&apos;t answer. Reload the page in a minute.</p>
      </>
    );
  }

  const { neighborhood: n, top, asOf } = page;
  return (
    <>
      <Link className="back" href="/">
        Search an address
      </Link>
      <h1>The most haunted buildings in {n.ntaName}</h1>
      <p className="ash" style={{ marginTop: 14 }}>
        {count(n.count)} residential buildings with 3 or more apartments. The median score is {score(n.medianScore)}.
      </p>
      {!n.ranked ? (
        <p className="ash">This neighborhood has too few comparable buildings (under 20) to rank fairly.</p>
      ) : (
        <table className="ledger">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Building</th>
              <th className="num">Apartments</th>
              <th className="num">Class C</th>
              <th className="num">Class B</th>
              <th className="num">Class A</th>
              <th className="num">Score</th>
            </tr>
          </thead>
          <tbody>
            {top.map((b) => (
              <tr key={b.bbl}>
                <td className="rank">{b.rank}</td>
                <td className="addr">
                  <Link href={buildingHref(b.bbl, b.address)}>
                    <Fell>{b.address}</Fell>
                  </Link>
                </td>
                <td className="num" data-label="Apartments">
                  {count(b.unitsRes)}
                </td>
                <td className="num c" data-label="Class C">
                  {count(b.violations.c)}
                </td>
                <td className="num" data-label="Class B">
                  {count(b.violations.b)}
                </td>
                <td className="num" data-label="Class A">
                  {count(b.violations.a)}
                </td>
                <td className="num" data-label="Score">
                  {score(b.score)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="fine measure">
        Score = (3 × class C + 2 × class B + 1 × class A) HPD violations over 36 months, divided by apartments. Small buildings can rank
        high from a few bad inspections, so read the counts too.
        {asOf && <> Rankings refreshed {nyDate(asOf.publishedAt)}.</>}
      </p>
    </>
  );
}
