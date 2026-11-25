// Records live geosearch responses as test fixtures, trimmed to the fields the linker reads.
// Run from packages/core: node scripts/record-geosearch-fixtures.mjs
import { writeFileSync } from "node:fs";

const QUERIES = {
  "building-a": "1248 St Marks Avenue Brooklyn",
  "building-b": "350 E 88th St Manhattan",
  "no-housenumber": "Broadway",
  "no-borough": "350 88th St",
  "not-found": "zzzzqqqq xyzzy",
  // Day-2 review: queries the day-1 rules matched to the wrong building.
  "new-york-ny": "350 88th St, New York, NY",
  "wrong-housenumber": "100 Main St, New York, NY",
  "fake-street": "123 Fake Street Queens",
  "postcode": "350 88th St, NY 10128",
};

const PROPS = ["label", "borough", "confidence", "match_type", "housenumber", "street", "postalcode"];

for (const [name, text] of Object.entries(QUERIES)) {
  const url = `https://geosearch.planninglabs.nyc/v2/search?${new URLSearchParams({ text, size: "5" })}`;
  const body = await (await fetch(url)).json();
  const out = {
    geocoding: { query: { text: body.geocoding.query.text, parsed_text: body.geocoding.query.parsed_text ?? {} } },
    features: body.features.map((f) => {
      const p = f.properties;
      const kept = Object.fromEntries(PROPS.filter((k) => k in p).map((k) => [k, p[k]]));
      kept.addendum = { pad: { bbl: p.addendum?.pad?.bbl ?? null, bin: p.addendum?.pad?.bin ?? null } };
      return { properties: kept };
    }),
  };
  writeFileSync(new URL(`../test/fixtures/geosearch-${name}.json`, import.meta.url), JSON.stringify(out, null, 2) + "\n");
  console.log(name.padEnd(18), body.features.length, "features");
}
