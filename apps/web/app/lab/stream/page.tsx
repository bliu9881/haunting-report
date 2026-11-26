// TEMPORARY (building-dossier task 1): checks whether Hostinger's CDN passes streamed responses through.
// Remove after the measurement.
import { Suspense } from "react";

export const dynamic = "force-dynamic";

async function Slow({ ms }: { ms: number }) {
  await new Promise((r) => setTimeout(r, ms));
  return <p id="slow-part">STREAM-SLOW-PART after {ms} ms</p>;
}

export default function StreamLab() {
  return (
    <>
      <p id="fast-part">STREAM-FAST-PART</p>
      <Suspense fallback={<p>loading the slow part...</p>}>
        <Slow ms={4000} />
      </Suspense>
    </>
  );
}
