import Link from "next/link";

/** One-click demo searches (haunted-design Requirement 3.1). */
const EXAMPLES = [
  { q: "1248 St Marks Ave, Brooklyn", note: "a possessed walk-up" },
  { q: "350 E 88th St, Manhattan", note: "no housing records" },
  { q: "350 88th St, New York, NY", note: "which borough?" },
];

export default async function Home({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  return (
    <>
      <section className="hero">
        <h1>How haunted is your next building?</h1>
        <p>
          Type an NYC address before you sign a lease. We summon the city&apos;s own records on that building and rank it against
          every comparable building in its neighborhood.
        </p>
        <form action="/search" className="search">
          <input name="q" defaultValue={q ?? ""} placeholder="1248 St Marks Ave, Brooklyn" aria-label="NYC address" maxLength={200} required />
          <button type="submit">Search</button>
        </form>
        <div className="chips">
          <span className="label">Try:</span>
          {EXAMPLES.map((e) => (
            <Link key={e.q} className="chip" href={`/search?q=${encodeURIComponent(e.q)}`}>
              {e.q} <span className="muted">· {e.note}</span>
            </Link>
          ))}
        </div>
      </section>

      <ol className="steps" aria-label="How it works">
        <li>
          <span className="label">I. Find the body</span>
          <b>One building, not a guess</b>
          <span className="muted small">NYC Geosearch turns your words into the city&apos;s building IDs, and asks when an address is ambiguous.</span>
        </li>
        <li>
          <span className="label">II. Stitch it together</span>
          <b>Seven city datasets, one record</b>
          <span className="muted small">Violations, complaints, 311, evictions, permits and building facts, joined across mismatched IDs.</span>
        </li>
        <li>
          <span className="label">III. Measure the haunting</span>
          <b>Ranked against its neighbors</b>
          <span className="muted small">About 172,000 buildings scored nightly on hazardous violations per apartment, within each neighborhood.</span>
        </li>
      </ol>
    </>
  );
}
