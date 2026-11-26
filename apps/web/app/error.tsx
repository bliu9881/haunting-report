"use client";
import Link from "next/link";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <section className="hero">
      <h1>The record wouldn&apos;t open</h1>
      <p>Something failed while building this page. The city&apos;s data is unaffected.</p>
      <p>
        <button type="button" className="retry" onClick={reset}>
          Try again
        </button>{" "}
        or <Link href="/">search for another building</Link>.
      </p>
    </section>
  );
}
