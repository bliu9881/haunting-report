export default async function Home({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  return (
    <>
      <h1>How haunted is your next building?</h1>
      <p className="muted">
        Type an NYC address. We stitch together the city&apos;s housing violations, complaints and evictions into one report, and rank
        the building against its neighbors.
      </p>
      <form action="/search" className="search">
        <input name="q" defaultValue={q ?? ""} placeholder="1248 St Marks Ave, Brooklyn" aria-label="NYC address" maxLength={200} required />
        <button type="submit">Search</button>
      </form>
    </>
  );
}
