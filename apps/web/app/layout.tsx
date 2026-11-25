import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Haunting Report",
  description: "How haunted is your next NYC building? A dossier stitched together from the city's own records.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <Link href="/" className="brand">
            Haunting Report
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
