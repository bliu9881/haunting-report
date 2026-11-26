import type { Metadata } from "next";
import Link from "next/link";
import { Ghost } from "./components/ghost";
import "./globals.css";

export const metadata: Metadata = {
  title: "Haunting Report",
  description: "How haunted is your next NYC building? A case file stitched together from the city's own records.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="fog" aria-hidden />
        <header className="site-header">
          <Link href="/" className="brand" aria-label="Haunting Report, home">
            <Ghost size={28} />
            <span className="brand-name">Haunting Report</span>
          </Link>
        </header>
        <main>{children}</main>
        <footer className="site-footer">
          Built from NYC Open Data. Records can lag or be incomplete. This is not legal advice or a safety guarantee.
        </footer>
      </body>
    </html>
  );
}
