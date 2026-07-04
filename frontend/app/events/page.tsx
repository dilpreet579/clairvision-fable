"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import IngestForm from "@/components/IngestForm";
import StatusLine from "@/components/StatusLine";
import { listEvents } from "@/lib/api-client";
import type { EventRead } from "@/lib/types";

export default function EventsPage() {
  const [events, setEvents] = useState<EventRead[] | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const handleCreated = useCallback((event: EventRead) => {
    setEvents((prev) => [event, ...(prev ?? [])]);
  }, []);

  const handleUpdate = useCallback((updated: EventRead) => {
    setEvents((prev) =>
      prev ? prev.map((e) => (e.id === updated.id ? updated : e)) : prev,
    );
  }, []);

  return (
    <div>
      <h1 className="text-base font-medium">New event</h1>
      <div className="mt-4">
        <IngestForm onCreated={handleCreated} />
      </div>

      <h2 className="mt-14 text-base font-medium">Events</h2>
      <div className="mt-4">
        {error && <p className="text-sm text-muted">{error}</p>}
        {!error && events === null && (
          <ul className="divide-y divide-surface">
            {[0, 1, 2].map((i) => (
              <li key={i} className="py-4">
                <div className="cv-skeleton h-4 w-48 rounded-sm" />
                <div className="cv-skeleton mt-2 h-3 w-72 rounded-sm" />
              </li>
            ))}
          </ul>
        )}
        {events !== null && events.length === 0 && (
          <p className="text-sm text-muted">No events yet.</p>
        )}
        {events !== null && events.length > 0 && (
          <ul className="divide-y divide-surface">
            {events.map((event) => (
              <li
                key={event.id}
                className="flex flex-col gap-1 py-4 sm:flex-row sm:items-baseline sm:justify-between"
              >
                <div>
                  {event.status === "ready" ? (
                    <Link
                      href={`/events/${event.id}/gallery`}
                      className="text-sm text-accent transition-colors duration-fast hover:text-fg"
                    >
                      {event.name}
                    </Link>
                  ) : (
                    <span className="text-sm text-fg">{event.name}</span>
                  )}
                </div>
                <StatusLine event={event} onUpdate={handleUpdate} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
