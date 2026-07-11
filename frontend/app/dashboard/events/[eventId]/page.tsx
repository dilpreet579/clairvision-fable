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
  "w-full border-b border-line bg-transparent px-0 py-2.5 text-sm text-fg " +
  "placeholder:text-muted focus:border-accent focus:outline-none " +
  "transition-colors duration-fast";

const labelClass =
  "block text-[11px] font-medium uppercase tracking-[0.1em] text-muted2 mb-1.5";

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
    return (
      <div className="pt-8">
        <p className="text-sm text-muted">{loadError}</p>
        <Link
          href="/dashboard"
          className="mt-4 inline-block text-sm text-accent transition-colors duration-fast hover:text-fg"
        >
          ← Back to events
        </Link>
      </div>
    );
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

  const publicUrl = event.visibility === "published" ? `/e/${event.slug}` : null;

  return (
    <div style={{ animation: "cvfade 0.3s ease-out" }}>
      {/* ── Back link ───────────────────────────────── */}
      <Link
        href="/dashboard"
        className="text-sm text-muted transition-colors duration-fast hover:text-fg"
      >
        ← Events
      </Link>

      {/* ── Event header ────────────────────────────── */}
      <div className="mt-5 flex flex-col gap-3 border-b border-line pb-7 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-serif text-[clamp(1.6rem,3vw,2rem)] leading-tight text-fg">
            {event.name}
          </h1>
          <p className="mt-1.5 text-sm text-muted">
            {publicUrl ? (
              <>
                Published —{" "}
                <Link
                  href={publicUrl}
                  className="text-accent underline underline-offset-2 transition-colors duration-fast hover:text-fg"
                >
                  {publicUrl}
                </Link>
              </>
            ) : event.visibility === "archived" ? (
              "Archived — not publicly visible."
            ) : (
              "Draft — not publicly visible."
            )}
          </p>
        </div>
        <div className="shrink-0">
          <StatusLine event={event} onUpdate={setEvent} />
        </div>
      </div>

      {/* ── Details form ────────────────────────────── */}
      <section className="mt-10 max-w-md">
        <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted2">
          Details
        </p>
        <form onSubmit={handleSave} className="mt-5 space-y-5">
          <div>
            <label className={labelClass}>Event name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Event name"
              maxLength={200}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>URL slug</label>
            <input
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="url-slug"
              maxLength={200}
              className={inputClass}
            />
            <p className="mt-1.5 text-[11px] text-muted2">
              Changing the slug breaks any previously shared /e/ link.
            </p>
          </div>
          <button
            type="submit"
            disabled={!dirty || saving || !name.trim() || !slug.trim()}
            className="rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-bg transition-colors duration-fast hover:bg-accentHover disabled:cursor-default disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </form>
      </section>

      {/* ── Visibility actions ───────────────────────── */}
      <section className="mt-12 border-t border-line pt-10">
        <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted2">
          Visibility
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          {event.visibility !== "published" && (
            <button
              type="button"
              disabled={actionBusy || event.status !== "ready"}
              onClick={() => run(() => publishEvent(event.id))}
              title={
                event.status !== "ready"
                  ? "Pipeline must finish before publishing."
                  : undefined
              }
              className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-bg transition-colors duration-fast hover:bg-accentHover disabled:cursor-default disabled:opacity-50"
            >
              Publish
            </button>
          )}
          {event.visibility !== "archived" && (
            <button
              type="button"
              disabled={actionBusy}
              onClick={() => run(() => archiveEvent(event.id))}
              className="rounded-full border border-line px-4 py-2 text-sm text-muted transition-colors duration-fast hover:border-fg hover:text-fg disabled:cursor-default disabled:opacity-50"
            >
              Archive
            </button>
          )}
          {event.visibility === "archived" && (
            <button
              type="button"
              disabled={actionBusy}
              onClick={() => run(() => unarchiveEvent(event.id))}
              className="rounded-full border border-line px-4 py-2 text-sm text-muted transition-colors duration-fast hover:border-fg hover:text-fg disabled:cursor-default disabled:opacity-50"
            >
              Unarchive to draft
            </button>
          )}

          {/* delete — two-step confirm */}
          {!confirmingDelete ? (
            <button
              type="button"
              disabled={actionBusy}
              onClick={() => setConfirmingDelete(true)}
              className="ml-auto rounded-full border border-danger/40 px-4 py-2 text-sm text-danger/70 transition-colors duration-fast hover:border-danger hover:text-danger disabled:cursor-default disabled:opacity-50"
            >
              Delete event
            </button>
          ) : (
            <div className="ml-auto flex items-center gap-3 rounded-lg border border-danger/30 bg-danger/5 px-4 py-2.5">
              <span className="text-xs text-muted">
                Permanent — deletes all photos, faces and search data.
              </span>
              <button
                type="button"
                disabled={actionBusy}
                onClick={handleDelete}
                className="shrink-0 text-sm font-medium text-danger transition-colors duration-fast hover:text-fg"
              >
                {actionBusy ? "Deleting…" : "Confirm"}
              </button>
              <button
                type="button"
                disabled={actionBusy}
                onClick={() => setConfirmingDelete(false)}
                className="shrink-0 text-sm text-muted transition-colors duration-fast hover:text-fg"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
        {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      </section>

      {/* ── Curation grid ───────────────────────────── */}
      <section className="mt-12 border-t border-line pt-10">
        <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted2">
          Photos
        </p>
        <p className="mt-1.5 text-sm text-muted">
          Hidden photos stay out of the public gallery and search — reversible any time.
        </p>
        <div className="mt-6">
          <PreviewGrid eventId={event.id} />
        </div>
      </section>
    </div>
  );
}
