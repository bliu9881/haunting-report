// Prints what the request path will see for a building and its neighborhood. Run with --env-file.
import { configFromEnv, createMariaStore } from "@haunting/store";
const bbl = process.argv[2] ?? "3013610043";
const store = await createMariaStore(configFromEnv());
try {
  const meta = await store.published();
  console.log("published:", meta);
  const b = await store.getBuilding(bbl);
  console.log("building:", b);
  if (b?.ntaCode) {
    console.log("neighborhood:", await store.getNeighborhood(b.ntaCode));
    for (const t of await store.topInNeighborhood(b.ntaCode, 5)) {
      console.log(`  #${t.rank} ${t.address}  units ${t.unitsRes}  C/B/A ${t.violations.c}/${t.violations.b}/${t.violations.a}  score ${t.score.toFixed(2)}`);
    }
  }
} finally {
  await store.close();
}
