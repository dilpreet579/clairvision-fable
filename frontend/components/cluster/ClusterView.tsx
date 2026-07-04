"use client";

import { useEffect, useState } from "react";
import ClusterCanvas from "./ClusterCanvas";
import { getClusterPoints } from "@/lib/api-client";
import type { ClusterPoint } from "@/lib/types";

/**
 * Fetches the UMAP projection and fills the full available area under the
 * top nav with the scatter canvas. Loading = minimal animated dot; empty
 * and error states are single sentences.
 */
export default function ClusterView({ eventId }: { eventId: string }) {
  const [points, setPoints] = useState<ClusterPoint[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPoints(null);
    setError(null);
    getClusterPoints(eventId)
      .then((data) => {
        if (!cancelled) setPoints(data);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load the cluster map.");
      });
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  return (
    <div className="h-[calc(100vh-9.5rem)] min-h-[420px] w-full">
      {error && (
        <div className="flex h-full items-center justify-center">
          <p className="text-sm text-muted">{error}</p>
        </div>
      )}
      {!error && points === null && (
        <div className="flex h-full items-center justify-center">
          <span className="cv-dot" aria-hidden />
        </div>
      )}
      {!error && points !== null && points.length === 0 && (
        <div className="flex h-full items-center justify-center">
          <p className="text-sm text-muted">No images to map for this event yet.</p>
        </div>
      )}
      {!error && points !== null && points.length > 0 && (
        <ClusterCanvas eventId={eventId} points={points} />
      )}
    </div>
  );
}
