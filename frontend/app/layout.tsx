import type { Metadata } from "next";
import { Inter, Newsreader } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

// Serif, used selectively (headlines, wordmark) via the `font-serif`
// Tailwind class — Inter stays the base body sans below.
const newsreader = Newsreader({
  subsets: ["latin"],
  weight: ["400", "500"],
  style: ["normal", "italic"],
  variable: "--font-newsreader",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ClairVision",
  description: "AI-curated event photo galleries",
};

// No global nav here — the public event page (app/e/[slug]/page.tsx,
// which renders its own back-link + wordmark inline), the dashboard
// (DashboardNav), and the chromeless (auth) pages each bring their own.
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.className} ${newsreader.variable}`}>
      <body className="min-h-screen bg-bg text-fg">{children}</body>
    </html>
  );
}
