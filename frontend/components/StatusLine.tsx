"use client";

import { useEffect, useState } from "react";
import { getEvent } from "@/lib/api-client";
import type { EventRead, PipelineStage } from "@/lib/types";

const STAGE_LABELS: Record<PipelineStage, string> = {
  none: "Queued",
  ingestion: "Fetching images",
  stage1_quality: "Filtering blurry shots",
  stage2_duplicates: "Collapsing duplicates",
  stage3_faces: "Indexing faces",
};

const POLL_MS = 2500;

/**
 * Single-line pipeline status indicator with colored pill states.
 * Polls while pending/processing; dot animation is the only motion.
 */
export default function StatusLine({
  event,
  onUpdate,
}: {
  event: EventRead;
  onUpdate?: (event: EventRead) => void;
}) {
  const [current, setCurrent] = useState(event);

  useEffect(() => {
    setCurrent(event);
  }, [event]);

  useEffect(() => {
    if (current.status !== "pending" && current.status !== "processing") return;
    const timer = setInterval(async () => {
      try {
        const fresh = await getEvent(current.id);
        setCurrent(fresh);
        onUpdate?.(fresh);
      } catch {
        // transient poll failure — try again next tick
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [current.id, current.status, onUpdate]);

  if (current.status === "ready") {
    const count = current.selected_image_count ?? 0;
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-2.5 py-0.5 text-xs text-accent">
        <span
          aria-hidden
          className="h-1.5 w-1.5 rounded-full bg-accent"
        />
        Ready · {count.toLocaleString()} curated
      </span>
    );
  }

  if (current.status === "failed") {
    return (
      <span
        className="inline-flex max-w-[32ch] items-center gap-1.5 rounded-full border border-danger/30 bg-danger/10 px-2.5 py-0.5 text-xs text-danger"
        title={current.error_message ?? undefined}
      >
        <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-danger" />
        <span className="truncate">
          Failed
          {current.error_message ? ` — ${current.error_message}` : ""}
        </span>
      </span>
    );
  }

  const label =
    current.status === "pending"
      ? "Queued"
      : (STAGE_LABELS[current.current_stage] ?? "Processing");

  return (
    <span className="inline-flex items-center gap-2 text-xs text-muted">
      <span className="cv-dot" aria-hidden />
      {label}
    </span>
  );
}
