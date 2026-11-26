import Link from "next/link";

/** One-click demo searches (haunted-design Requirement 3.1). */
const EXAMPLES = [
  { q: "1248 St Marks Ave, Brooklyn", note: "a walk-up in the worst 10% of its neighborhood" },
  { q: "350 E 88th St, Manhattan", note: "an office building, with no housing records" },
  { q: "350 88th St, New York, NY", note: "an address in three boroughs" },
];

export default async function Home({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  return (
    <>
      <section className="hero">
        <h1>How haunted is your next building?</h1>
        <p>
          Before you sign a lease, ask the city&apos;s own records. We gather a building&apos;s violations, complaints, evictions and
          permits into one record, and rank it against every comparable building in its neighborhood.
        </p>
        <form action="/search" className="search" role="search">
          <input name="q" defaultValue={q ?? ""} placeholder="1248 St Marks Ave, Brooklyn" aria-label="NYC street address" maxLength={200} required />
          <button type="submit">Search</button>
        </form>
        <ul className="examples" aria-label="Example searches">
          {EXAMPLES.map((e) => (
            <li key={e.q}>
              <Link href={`/search?q=${encodeURIComponent(e.q)}`}>{e.q}</Link>, {e.note}
            </li>
          ))}
        </ul>
      </section>

      <ol className="method" aria-label="How a record is made">
        <li>
          <h2>Find the building</h2>
          <p>NYC Geosearch turns the address into the city&apos;s building numbers. If an address could mean more than one building, we ask.</p>
        </li>
        <li>
          <h2>Gather its records</h2>
          <p>Seven city datasets that each name buildings differently: violations, complaints, 311, evictions, permits and land use.</p>
        </li>
        <li>
          <h2>Weigh it against its neighbors</h2>
          <p>About 172,000 buildings are scored every night on hazardous violations per apartment, within each neighborhood.</p>
        </li>
      </ol>
    </>
  );
}
