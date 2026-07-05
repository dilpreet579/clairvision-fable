"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { publicDirectory } from "@/lib/api-client";
import type { PublicEventSummary } from "@/lib/types";

// Public homepage: the directory of published events. Anonymous, no nav
// chrome beyond the wordmark and a quiet organizer-login link.
export default function HomePage() {
  const [events, setEvents] = useState<PublicEventSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    publicDirectory()
      .then((data) => {
        if (!cancelled) setEvents(data);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load events.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <header className="border-b border-surface">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <span className="text-sm font-medium tracking-wide text-fg">
            ClairVision
          </span>
          <Link
            href="/login"
            className="text-sm text-muted transition-colors duration-fast hover:text-fg"
          >
            Organizer login
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-4 pb-16 pt-8 sm:px-6">
        <h1 className="text-base font-medium">Events</h1>
        <div className="mt-4">
          {error && <p className="text-sm text-muted">{error}</p>}
          {!error && events === null && (
            <ul className="divide-y divide-surface">
              {[0, 1, 2].map((i) => (
                <li key={i} className="py-4">
                  <div className="cv-skeleton h-4 w-48 rounded-sm" />
                </li>
              ))}
            </ul>
          )}
          {events !== null && events.length === 0 && (
            <p className="text-sm text-muted">No published events yet.</p>
          )}
          {events !== null && events.length > 0 && (
            <ul className="divide-y divide-surface">
              {events.map((event) => (
                <li key={event.id} className="py-4">
                  <Link
                    href={`/e/${event.slug}/gallery`}
                    className="text-sm text-accent transition-colors duration-fast hover:text-fg"
                  >
                    {event.name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </>
  );
}
