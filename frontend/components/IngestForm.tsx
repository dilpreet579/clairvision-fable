"use client";

import { useState } from "react";
import { createEvent } from "@/lib/api-client";
import type { EventRead } from "@/lib/types";

const inputClass =
  "w-full border-b border-line bg-transparent px-0 py-2 text-sm text-fg " +
  "placeholder:text-muted focus:border-accent focus:outline-none " +
  "transition-colors duration-fast";

/**
 * New-event form: name + source URL, solid amber submit pill.
 */
export default function IngestForm({
  onCreated,
}: {
  onCreated: (event: EventRead) => void;
}) {
  const [name, setName] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !sourceUrl.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const event = await createEvent({
        name: name.trim(),
        source_url: sourceUrl.trim(),
      });
      onCreated(event);
      setName("");
      setSourceUrl("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed.");
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = !submitting && name.trim() && sourceUrl.trim();

  return (
    <form onSubmit={handleSubmit} className="max-w-md">
      <div className="space-y-5">
        <div>
          <label className="block text-[11px] font-medium uppercase tracking-[0.1em] text-muted2 mb-1.5">
            Event name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Arora Wedding — Jaipur"
            maxLength={200}
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium uppercase tracking-[0.1em] text-muted2 mb-1.5">
            Source URL
          </label>
          <input
            type="url"
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            placeholder="https://…"
            maxLength={2000}
            className={inputClass}
          />
          <p className="mt-1.5 text-[11px] text-muted2">
            A URL pointing at the photo collection — JSON manifest or HTML directory.
          </p>
        </div>
      </div>

      <button
        type="submit"
        disabled={!canSubmit}
        className="mt-7 rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-bg transition-colors duration-fast hover:bg-accentHover disabled:cursor-default disabled:opacity-50"
      >
        {submitting ? "Submitting…" : "Create event"}
      </button>

      {error && (
        <p className="mt-3 text-sm text-danger">{error}</p>
      )}
    </form>
  );
}
