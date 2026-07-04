"use client";

import { thumbnailUrl } from "@/lib/api-client";
import type { SearchResult } from "@/lib/types";

/**
 * Search results in the same grid layout as the gallery. Similarity is a
 * small muted percentage tag on each result card.
 */
export default function ResultsGrid({
  eventId,
  results,
}: {
  eventId: string;
  results: SearchResult[];
}) {
  if (results.length === 0) {
    return <p className="text-sm text-muted">No matching photos found.</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
      {results.map((result) => (
        <figure key={result.image_id} className="relative">
          <img
            src={thumbnailUrl(eventId, result.image_id, 400)}
            alt=""
            loading="lazy"
            className="block aspect-[4/3] w-full object-cover"
          />
          <figcaption className="absolute bottom-2 right-2 text-[11px] text-fg/60">
            {Math.round(result.similarity * 100)}%
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
