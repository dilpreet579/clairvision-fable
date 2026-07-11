"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { publicDirectory } from "@/lib/api-client";
import type { PublicEventSummary } from "@/lib/types";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// Public homepage: hero + client-side search over the directory of
// published events. Anonymous, no nav chrome beyond the wordmark and a
// quiet organizer-login link.
export default function HomePage() {
  const router = useRouter();
  const [events, setEvents] = useState<PublicEventSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

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

  const filtered = useMemo(() => {
    const list = events ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((event) => event.name.toLowerCase().includes(q));
  }, [events, query]);

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && filtered.length > 0) {
      router.push(`/e/${filtered[0].slug}`);
    }
  }

  return (
    <>
      <header className="border-b border-line">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <span className="font-serif text-lg italic tracking-wide text-fg">
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

      <main className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-6">
        {/* hero */}
        <section className="relative overflow-hidden pt-16 sm:pt-24">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-24 -top-16 -z-10 h-[440px] w-[440px] rounded-full blur-3xl"
            style={{
              background:
                "radial-gradient(circle, rgba(217,160,91,0.14), transparent 70%)",
              animation: "cvglow 9s ease-in-out infinite",
            }}
          />
          <h1 className="max-w-[14ch] font-serif text-[clamp(2.5rem,6vw,3.625rem)] leading-[1.05] text-fg">
            Find yourself in the photos.
          </h1>
          <p className="mt-5 max-w-[44ch] text-base text-muted">
            Search any published event by face — no account, no sign-in.
            Upload a selfie and find every photo you&rsquo;re in.
          </p>

          {/* search */}
          <div className="mt-10 max-w-md">
            <div className="flex items-center gap-2 rounded-lg border border-line bg-surface px-4 py-3">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Search events by name…"
                aria-label="Search events by name"
                className="w-full bg-transparent text-sm text-fg placeholder:text-muted focus:outline-none"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Clear search"
                  className="text-muted transition-colors duration-fast hover:text-fg"
                >
                  ×
                </button>
              )}
            </div>
          </div>
        </section>

        {/* directory */}
        <section className="mt-16">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted">
            Published events
          </p>
          <p className="mt-1.5 text-sm italic text-muted2">
            Names and dates only — each event&rsquo;s photos stay behind its
            own link.
          </p>

          <div className="mt-6">
            {error && <p className="text-sm text-muted">{error}</p>}

            {!error && events === null && (
              <ul className="divide-y divide-line">
                {[0, 1, 2].map((i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between py-5"
                  >
                    <div className="cv-skeleton h-4 w-48 rounded-sm" />
                    <div className="cv-skeleton h-3 w-16 rounded-sm" />
                  </li>
                ))}
              </ul>
            )}

            {!error && events !== null && events.length === 0 && (
              <p className="text-sm text-muted">
                No published events yet — check back once your organizer
                shares one.
              </p>
            )}

            {!error &&
              events !== null &&
              events.length > 0 &&
              filtered.length === 0 && (
                <p className="text-sm text-muted">{`No events match "${query}".`}</p>
              )}

            {!error && events !== null && filtered.length > 0 && (
              <ul className="border-t border-line">
                {filtered.map((event, i) => (
                  <li key={event.id} className="border-b border-line">
                    <Link
                      href={`/e/${event.slug}`}
                      className="group -mx-3 flex items-center justify-between gap-4 rounded px-3 py-6 transition-colors duration-fast hover:bg-surface"
                    >
                      <span className="flex min-w-0 items-baseline gap-4">
                        <span className="font-mono text-xs tabular-nums text-muted2 transition-colors duration-fast group-hover:text-accent">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <span className="truncate font-serif text-[clamp(1.25rem,2.5vw,1.6875rem)] text-fg transition-colors duration-fast group-hover:text-accent">
                          {event.name}
                        </span>
                      </span>
                      <span className="shrink-0 text-sm tabular-nums text-muted">
                        {formatDate(event.published_at)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <footer className="mt-16">
          <p className="text-xs text-muted2">
            Photos are searchable only within their own event. Want a photo
            of you removed? Contact the organizer.
          </p>
        </footer>
      </main>
    </>
  );
}
