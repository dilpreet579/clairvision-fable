"use client";

import Link from "next/link";
import { useState } from "react";
import { listFaces, thumbnailUrl } from "@/lib/api-client";
import type { FaceRead, ImageRead } from "@/lib/types";

/**
 * A photo sitting directly on the background — no card chrome.
 * Metadata (face count, duplicate indicator, clickable face regions)
 * appears only on hover as a subtle overlay.
 */
export default function ImageCard({
  eventId,
  image,
  searchPath,
  onToggleDuplicates,
  duplicatesOpen,
}: {
  eventId: string;
  image: ImageRead;
  /** Route of the search page in the current tree, e.g. /e/{slug}/search —
   * the same card renders under both the public and dashboard trees. */
  searchPath: string;
  onToggleDuplicates?: (image: ImageRead) => void;
  duplicatesOpen?: boolean;
}) {
  const [faces, setFaces] = useState<FaceRead[] | null>(null);
  const [hovered, setHovered] = useState(false);

  function handleMouseEnter() {
    setHovered(true);
    if (faces === null && image.face_count > 0) {
      listFaces(eventId, image.id)
        .then(setFaces)
        .catch(() => setFaces([]));
    }
  }

  const w = image.width ?? 1;
  const h = image.height ?? 1;

  return (
    <figure
      className="group relative overflow-hidden"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setHovered(false)}
    >
      <img
        src={thumbnailUrl(eventId, image.id, 400)}
        alt=""
        loading="lazy"
        className="block aspect-[4/3] w-full object-cover"
      />

      {/* subtle hover overlay */}
      <div
        className={`pointer-events-none absolute inset-0 bg-black/35 transition-opacity duration-fast ${
          hovered || duplicatesOpen ? "opacity-100" : "opacity-0"
        }`}
      />

      {/* clickable face regions -> search by face */}
      {hovered &&
        faces?.map((face) => (
          <Link
            key={face.id}
            href={`${searchPath}?face_id=${face.id}`}
            aria-label="Search photos of this person"
            className="absolute border border-accent/60 transition-colors duration-fast hover:border-accent"
            style={{
              left: `${(face.bbox_x / w) * 100}%`,
              top: `${(face.bbox_y / h) * 100}%`,
              width: `${(face.bbox_w / w) * 100}%`,
              height: `${(face.bbox_h / h) * 100}%`,
            }}
          />
        ))}

      {/* metadata revealed on hover only */}
      <figcaption
        className={`absolute inset-x-0 bottom-0 flex items-end justify-between p-2 transition-opacity duration-fast ${
          hovered || duplicatesOpen ? "opacity-100" : "opacity-0"
        }`}
      >
        <span className="text-xs text-fg/80">
          {image.face_count > 0
            ? `${image.face_count} face${image.face_count === 1 ? "" : "s"}`
            : ""}
        </span>
        {image.duplicate_group && onToggleDuplicates && (
          <button
            type="button"
            onClick={() => onToggleDuplicates(image)}
            className={`text-xs transition-colors duration-fast ${
              duplicatesOpen ? "text-fg" : "text-accent hover:text-fg"
            }`}
          >
            {image.duplicate_group.member_count} shots
          </button>
        )}
      </figcaption>
    </figure>
  );
}
