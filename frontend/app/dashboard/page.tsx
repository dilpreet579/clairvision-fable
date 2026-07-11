"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import IngestForm from "@/components/IngestForm";
import StatusLine from "@/components/StatusLine";
import { listEvents } from "@/lib/api-client";
import type { EventRead, EventVisibility } from "@/lib/types";

const VISIBILITY_BADGE: Record<
  EventVisibility,
  { label: string; cls: string }
> = {
  draft: {
    label: "Draft",
    cls: "border-line text-muted2",
  },
  published: {
    label: "Published",
    cls: "border-accent/40 text-accent",
  },
  archived: {
    label: "Archived",
    cls: "border-line text-muted2",
  },
};

// Organizer event list — all visibilities, unlike the public directory.
export default function DashboardPage() {
  const [events, setEvents] = useState<EventRead[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listEvents()
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

  const handleCreated = useCallback(
    (event: EventRead) => {
      setEvents((prev) => [event, ...(prev ?? [])]);
      setShowForm(false);
    },
    [],
  );

  const handleUpdate = useCallback((updated: EventRead) => {
    setEvents((prev) =>
      prev ? prev.map((e) => (e.id === updated.id ? updated : e)) : prev,
    );
  }, []);

  return (
    <div style={{ animation: "cvfade 0.3s ease-out" }}>
      {/* ── Page header ─────────────────────────────── */}
      <div className="flex items-baseline justify-between gap-6 border-b border-line pb-8">
        <div>
          <h1 className="font-serif text-[clamp(1.6rem,3vw,2rem)] text-fg">
            Events
          </h1>
          <p className="mt-1 text-sm text-muted">
            Manage your photo events and pipeline status.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors duration-fast ${
            showForm
              ? "bg-surface text-muted hover:text-fg border border-line"
              : "bg-accent text-bg hover:bg-accentHover"
          }`}
        >
          {showForm ? "Cancel" : "New event"}
        </button>
      </div>

      {/* ── New-event form (toggle) ──────────────────── */}
      {showForm && (
        <div
          className="mt-8 rounded-lg border border-line bg-surface p-6"
          style={{ animation: "cvpop 0.18s ease-out" }}
        >
          <p className="mb-5 text-[11px] font-medium uppercase tracking-[0.12em] text-muted2">
            New event
          </p>
          <IngestForm onCreated={handleCreated} />
        </div>
      )}

      {/* ── Event list ──────────────────────────────── */}
      <div className="mt-10">
        {error && <p className="text-sm text-muted">{error}</p>}

        {/* skeleton */}
        {!error && events === null && (
          <ul className="divide-y divide-line">
            {[0, 1, 2].map((i) => (
              <li key={i} className="py-5">
                <div className="cv-skeleton h-4 w-56 rounded-sm" />
                <div className="cv-skeleton mt-2 h-3 w-32 rounded-sm" />
              </li>
            ))}
          </ul>
        )}

        {events !== null && events.length === 0 && (
          <div className="rounded-lg border border-dashed border-line px-6 py-14 text-center">
            <p className="font-serif text-lg italic text-muted">No events yet.</p>
            <p className="mt-2 text-sm text-muted2">
              Create your first event with the button above.
            </p>
          </div>
        )}

        {events !== null && events.length > 0 && (
          <ul className="divide-y divide-line">
            {events.map((event) => {
              const badge = VISIBILITY_BADGE[event.visibility];
              return (
                <li
                  key={event.id}
                  className="group -mx-2 flex flex-col gap-2 rounded px-2 py-5 transition-colors duration-fast hover:bg-surface sm:flex-row sm:items-center sm:justify-between"
                >
                  {/* left: name + visibility */}
                  <div className="flex min-w-0 items-baseline gap-3">
                    <Link
                      href={`/dashboard/events/${event.id}`}
                      className="font-serif text-xl text-fg transition-colors duration-fast group-hover:text-accent"
                    >
                      {event.name}
                    </Link>
                    <span
                      className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] ${badge.cls}`}
                    >
                      {badge.label}
                    </span>
                  </div>
                  {/* right: pipeline status */}
                  <div className="shrink-0">
                    <StatusLine event={event} onUpdate={handleUpdate} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
