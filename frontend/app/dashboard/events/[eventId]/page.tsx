"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import PreviewGrid from "@/components/dashboard/PreviewGrid";
import StatusLine from "@/components/StatusLine";
import {
  archiveEvent,
  deleteEvent,
  publishEvent,
  unarchiveEvent,
  updateEvent,
  getEvent,
} from "@/lib/api-client";
import type { EventRead } from "@/lib/types";

const inputClass =
  "w-full border-b border-line bg-transparent px-0 py-2 text-sm text-fg " +
  "placeholder:text-muted focus:border-accent focus:outline-none " +
  "transition-colors duration-fast";

const actionClass =
  "text-sm text-accent transition-colors duration-fast hover:text-fg " +
  "disabled:cursor-default disabled:text-muted";

export default function EventManagePage() {
  const { eventId } = useParams<{ eventId: string }>();
  const router = useRouter();

  const [event, setEvent] = useState<EventRead | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [saving, setSaving] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getEvent(eventId)
      .then((data) => {
        if (cancelled) return;
        setEvent(data);
        setName(data.name);
        setSlug(data.slug);
      })
      .catch(() => {
        if (!cancelled) setLoadError("Could not load this event.");
      });
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  if (loadError) {
    return <p className="text-sm text-muted">{loadError}</p>;
  }
  if (event === null) {
    return (
      <div className="flex h-[40vh] items-center justify-center">
        <span className="cv-dot" aria-hidden />
      </div>
    );
  }

  const dirty = name.trim() !== event.name || slug.trim() !== event.slug;

  async function run(fn: () => Promise<EventRead>) {
    if (actionBusy) return;
    setActionBusy(true);
    setError(null);
    try {
      setEvent(await fn());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setActionBusy(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!dirty || saving || !event) return;
    setSaving(true);
    setError(null);
    try {
      const body: { name?: string; slug?: string } = {};
      if (name.trim() !== event.name) body.name = name.trim();
      if (slug.trim() !== event.slug) body.slug = slug.trim();
      const updated = await updateEvent(event.id, body);
      setEvent(updated);
      setName(updated.name);
      setSlug(updated.slug);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (actionBusy || !event) return;
    setActionBusy(true);
    setError(null);
    try {
      await deleteEvent(event.id);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed.");
      setActionBusy(false);
      setConfirmingDelete(false);
    }
  }

  return (
    <div>
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <h1 className="text-base font-medium">{event.name}</h1>
        <StatusLine event={event} onUpdate={setEvent} />
      </div>
      <p className="mt-1 text-sm text-muted">
        {event.visibility === "published" ? (
          <>
            Published —{" "}
            <Link
              href={`/e/${event.slug}`}
              className="text-accent transition-colors duration-fast hover:text-fg"
            >
              /e/{event.slug}
            </Link>
          </>
        ) : event.visibility === "archived" ? (
          "Archived — not publicly visible."
        ) : (
          "Draft — not publicly visible."
        )}
      </p>

      {/* rename / slug */}
      <form onSubmit={handleSave} className="mt-10 max-w-md">
        <h2 className="text-base font-medium">Details</h2>
        <div className="mt-4 space-y-4">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Event name"
            maxLength={200}
            className={inputClass}
          />
          <input
            type="text"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="URL slug"
            maxLength={200}
            className={inputClass}
          />
        </div>
        <p className="mt-2 text-xs text-muted">
          Changing the slug breaks any previously shared /e/ link.
        </p>
        <button
          type="submit"
          disabled={!dirty || saving || !name.trim() || !slug.trim()}
          className={`mt-4 ${actionClass}`}
        >
          {saving ? "Saving..." : "Save changes"}
        </button>
      </form>

      {/* visibility + delete */}
      <div className="mt-10">
        <h2 className="text-base font-medium">Visibility</h2>
        <div className="mt-4 flex items-center gap-6">
          {event.visibility !== "published" && (
            <button
              type="button"
              disabled={actionBusy || event.status !== "ready"}
              onClick={() => run(() => publishEvent(event.id))}
              className={actionClass}
              title={
                event.status !== "ready"
                  ? "The pipeline must finish before publishing."
                  : undefined
              }
            >
              Publish
            </button>
          )}
          {event.visibility !== "archived" && (
            <button
              type="button"
              disabled={actionBusy}
              onClick={() => run(() => archiveEvent(event.id))}
              className={actionClass}
            >
              Archive
            </button>
          )}
          {event.visibility === "archived" && (
            <button
              type="button"
              disabled={actionBusy}
              onClick={() => run(() => unarchiveEvent(event.id))}
              className={actionClass}
            >
              Unarchive to draft
            </button>
          )}
          {!confirmingDelete ? (
            <button
              type="button"
              disabled={actionBusy}
              onClick={() => setConfirmingDelete(true)}
              className="text-sm text-muted transition-colors duration-fast hover:text-fg"
            >
              Delete event
            </button>
          ) : (
            <span className="flex items-center gap-4 text-sm">
              <span className="text-muted">
                Deletes all photos, faces and search data. Permanent.
              </span>
              <button
                type="button"
                disabled={actionBusy}
                onClick={handleDelete}
                className={actionClass}
              >
                {actionBusy ? "Deleting..." : "Confirm delete"}
              </button>
              <button
                type="button"
                disabled={actionBusy}
                onClick={() => setConfirmingDelete(false)}
                className="text-muted transition-colors duration-fast hover:text-fg"
              >
                Cancel
              </button>
            </span>
          )}
        </div>
        {error && <p className="mt-3 text-sm text-muted">{error}</p>}
      </div>

      {/* curation preview */}
      <div className="mt-14">
        <h2 className="text-base font-medium">Photos</h2>
        <p className="mt-1 text-sm text-muted">
          Hidden photos stay out of the public gallery and search —
          reversible any time.
        </p>
        <div className="mt-4">
          <PreviewGrid eventId={event.id} />
        </div>
      </div>
    </div>
  );
}
