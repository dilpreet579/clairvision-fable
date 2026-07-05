"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import DashboardNav from "@/components/dashboard/DashboardNav";
import { me } from "@/lib/api-client";

// The authoritative session check: middleware.ts only fast-paths on
// cookie *presence*; this layout asks the API and bounces to /login on
// anything but a valid organizer session.
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    me()
      .then(() => {
        if (!cancelled) setAuthed(true);
      })
      .catch(() => {
        if (!cancelled) router.replace("/login");
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!authed) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <span className="cv-dot" aria-hidden />
      </div>
    );
  }

  return (
    <>
      <DashboardNav />
      <main className="mx-auto w-full max-w-6xl px-4 pb-16 pt-8 sm:px-6">
        {children}
      </main>
    </>
  );
}
