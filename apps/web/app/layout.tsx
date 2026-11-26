import type { Metadata } from "next";
import Link from "next/link";
import { LogoMark } from "./components/logo";
import "./globals.css";

const DESCRIPTION = "How haunted is your next New York building? Ask the city's own records: violations, complaints, evictions and permits, ranked against the neighbors.";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL ?? "https://perky-mediumvioletred-giraffe-73.hostingersite.com"),
  title: { default: "Haunting Report", template: "%s · Haunting Report" },
  description: DESCRIPTION,
  openGraph: { title: "Haunting Report", description: DESCRIPTION, type: "website" },
  twitter: { card: "summary_large_image", title: "Haunting Report", description: DESCRIPTION },
};

export const viewport = { themeColor: "#1d1424" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <Link href="/" className="brand">
            <LogoMark size={30} />
            <span>Haunting Report</span>
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
