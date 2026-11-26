import Link from "next/link";
import { redirect } from "next/navigation";
import { resolveAddress, type AmbiguityReason } from "@haunting/core";
import { buildingHref } from "@/lib/links";

export const dynamic = "force-dynamic";

const PROMPTS: Record<AmbiguityReason, string> = {
  no_housenumber: "Which building did you mean? Add a house number to skip this step.",
  multiple_boroughs: "That address exists in more than one borough. Which one?",
  street_mismatch: "We couldn't find that street at that number. Did you mean one of these?",
  low_confidence: "We're not sure which building you meant. Pick one:",
};

export default async function Search({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = ((await searchParams).q ?? "").slice(0, 200).trim();
  if (q === "") redirect("/");

  const r = await resolveAddress(q, { fetch });
  if (r.kind === "match") redirect(buildingHref(r.building.bbl, r.building.label, q, r.building.bin));

  return (
    <>
      <p className="small">
        <Link href={`/?q=${encodeURIComponent(q)}`}>← Change search</Link>
      </p>
      <h1>&ldquo;{q}&rdquo;</h1>
      {r.kind === "ambiguous" && (
        <>
          <p className="muted">{PROMPTS[r.reason]}</p>
          <ul className="candidates">
            {r.candidates.map((c) => (
              <li key={`${c.bbl}-${c.bin ?? ""}`}>
                <Link href={buildingHref(c.bbl, c.label, q, c.bin)}>{c.label}</Link>
              </li>
            ))}
          </ul>
        </>
      )}
      {r.kind === "not_found" && <p className="muted">We couldn&apos;t find a building at that address. Check the house number and borough.</p>}
      {r.kind === "error" && <p className="muted">The city&apos;s address service isn&apos;t answering right now. Try again in a minute.</p>}
    </>
  );
}
