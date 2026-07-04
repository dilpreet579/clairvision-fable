import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import TopNav from "@/components/TopNav";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "ClairVision",
  description: "AI-curated event photo galleries",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.className}>
      <body className="min-h-screen bg-bg text-fg">
        <TopNav />
        <main className="mx-auto w-full max-w-6xl px-4 pb-16 pt-8 sm:px-6">
          {children}
        </main>
      </body>
    </html>
  );
}
