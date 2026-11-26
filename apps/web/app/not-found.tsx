import Link from "next/link";

export default function NotFound() {
  return (
    <section className="hero">
      <h1>Nothing answers at this address</h1>
      <p>This page doesn&apos;t exist, or the link has a typo in its building or neighborhood number.</p>
      <p>
        <Link href="/">Search for a building</Link>
      </p>
    </section>
  );
}
