import Link from "next/link";
import { Fell } from "@/app/components/fell";
import { redirect } from "next/navigation";
import { resolveAddress, type AmbiguityReason } from "@haunting/core";
import { buildingHref } from "@/lib/links";

export const dynamic = "force-dynamic";

const PROMPTS: Record<AmbiguityReason, string> = {
  no_housenumber: "Which building on that street? Add a house number next time to skip this step.",
  multiple_boroughs: "That address exists in more than one borough. Which one do you mean?",
  street_mismatch: "There's no building at that number on that street. Did you mean one of these?",
  low_confidence: "We're not sure which building you mean. Choose one:",
};

/** "350 EAST 88 STREET, New York, NY, USA" → address and place, shown in two columns. */
function split(label: string): { address: string; place: string } {
  const parts = label.replace(/, NY, USA$/, "").split(", ");
  return { address: parts[0] ?? label, place: parts.slice(1).join(", ") };
}

export default async function Search({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = ((await searchParams).q ?? "").slice(0, 200).trim();
  if (q === "") redirect("/");

  const r = await resolveAddress(q, { fetch });
  if (r.kind === "match") redirect(buildingHref(r.building.bbl, r.building.label, q, r.building.bin));

  return (
    <>
      <Link className="back" href={`/?q=${encodeURIComponent(q)}`}>
        Change the search
      </Link>
      <h1>
        <Fell>{`“${q}”`}</Fell>
      </h1>
      {r.kind === "ambiguous" && (
        <>
          <p className="ash" style={{ marginTop: 14 }}>
            {PROMPTS[r.reason]}
          </p>
          <ul className="candidates">
            {r.candidates.map((c) => {
              const { address, place } = split(c.label);
              return (
                <li key={`${c.bbl}-${c.bin ?? ""}`}>
                  <Link href={buildingHref(c.bbl, c.label, q, c.bin)}>
                    <span className="label">
                      <Fell>{address}</Fell>
                    </span>
                    <span className="borough">{place || c.borough}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
      {r.kind === "not_found" && (
        <p className="ash measure" style={{ marginTop: 14 }}>
          No building matches that address. Check the house number and add the borough, for example &ldquo;350 E 88th St, Manhattan&rdquo;.
        </p>
      )}
      {r.kind === "error" && (
        <p className="ash measure" style={{ marginTop: 14 }}>
          The city&apos;s address service didn&apos;t answer. Search again in a minute.
        </p>
      )}
    </>
  );
}
