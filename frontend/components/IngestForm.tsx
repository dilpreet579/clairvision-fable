"use client";

import { useState } from "react";
import { createEvent } from "@/lib/api-client";
import type { EventRead } from "@/lib/types";

/**
 * Plain form: two inputs, one submit button. Status is inline text only.
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

  const inputClass =
    "w-full border-b border-surface bg-transparent px-0 py-2 text-sm text-fg " +
    "placeholder:text-muted focus:border-accent focus:outline-none " +
    "transition-colors duration-fast";

  return (
    <form onSubmit={handleSubmit} className="max-w-md">
      <div className="space-y-4">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Event name"
          maxLength={200}
          className={inputClass}
        />
        <input
          type="url"
          value={sourceUrl}
          onChange={(e) => setSourceUrl(e.target.value)}
          placeholder="Source URL"
          maxLength={2000}
          className={inputClass}
        />
      </div>
      <button
        type="submit"
        disabled={submitting || !name.trim() || !sourceUrl.trim()}
        className="mt-5 text-sm text-accent transition-colors duration-fast hover:text-fg disabled:cursor-default disabled:text-muted"
      >
        {submitting ? "Submitting..." : "Submit event"}
      </button>
      {error && <p className="mt-3 text-sm text-muted">{error}</p>}
    </form>
  );
}
