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
 * Single line of pipeline status text. Polls the event while it is
 * pending/processing; the animated dot is the only loading affordance.
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
      <p className="text-sm text-muted">
        Ready — {count.toLocaleString()} images curated.
      </p>
    );
  }

  if (current.status === "failed") {
    return (
      <p className="text-sm text-muted">
        Failed — {current.error_message ?? "unknown error."}
      </p>
    );
  }

  const label =
    current.status === "pending"
      ? "Queued"
      : STAGE_LABELS[current.current_stage] ?? "Processing";

  return (
    <p className="flex items-center gap-2 text-sm text-muted">
      <span className="cv-dot" aria-hidden />
      {label}...
    </p>
  );
}
