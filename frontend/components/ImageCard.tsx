"use client";

import { useState } from "react";
import { listFaces, thumbnailUrl } from "@/lib/api-client";
import type { FaceRead, ImageRead } from "@/lib/types";

// Minimum face tap-target edge (Apple/Google guidance ~44px): detected
// face bboxes are often far smaller than a fingertip.
const MIN_TAP_TARGET_PX = 44;

/**
 * A photo sitting directly on the background — no card chrome.
 * Metadata (face count, duplicate indicator, clickable face regions)
 * reveals on hover with a mouse, or on first tap on touch devices
 * (hover doesn't exist there); a second tap on the photo opens the
 * full-size lightbox.
 */
export default function ImageCard({
  eventId,
  image,
  onFaceSelect,
  onOpenPhoto,
  onToggleDuplicates,
  duplicatesOpen,
}: {
  eventId: string;
  image: ImageRead;
  /** Tapping a detected face region calls this instead of navigating. */
  onFaceSelect: (faceId: string) => void;
  /** Tapping the photo itself (not a face) opens the lightbox. */
  onOpenPhoto: () => void;
  onToggleDuplicates?: (image: ImageRead) => void;
  duplicatesOpen?: boolean;
}) {
  const [faces, setFaces] = useState<FaceRead[] | null>(null);
  const [hovered, setHovered] = useState(false);
  const [tapped, setTapped] = useState(false);

  const revealed = hovered || tapped;

  function loadFaces() {
    if (faces === null && image.face_count > 0) {
      listFaces(eventId, image.id)
        .then(setFaces)
        .catch(() => setFaces([]));
    }
  }

  // Hover reveal is mouse-only: touch browsers emulate mouseenter on tap,
  // which would make the overlay un-dismissable, so gate on pointerType.
  function handlePointerEnter(e: React.PointerEvent) {
    if (e.pointerType !== "mouse") return;
    setHovered(true);
    loadFaces();
  }

  // Hover-capable devices: the overlay already follows the cursor, so a
  // click on the photo opens the lightbox straight away. Touch devices:
  // the first tap reveals face targets/the duplicates pill, a second tap
  // on the photo itself opens the lightbox.
  function handleClick() {
    const hoverCapable =
      typeof window !== "undefined" && window.matchMedia("(hover: hover)").matches;
    if (hoverCapable) {
      onOpenPhoto();
      return;
    }
    if (!tapped) {
      setTapped(true);
      loadFaces();
    } else {
      onOpenPhoto();
    }
  }

  const w = image.width ?? 1;
  const h = image.height ?? 1;

  return (
    <figure
      className="group relative overflow-hidden"
      onPointerEnter={handlePointerEnter}
      onPointerLeave={() => setHovered(false)}
      onClick={handleClick}
    >
      <img
        src={thumbnailUrl(eventId, image.id, 400)}
        alt=""
        loading="lazy"
        className="block aspect-square w-full object-cover"
      />

      {/* subtle overlay while revealed */}
      <div
        className={`pointer-events-none absolute inset-0 bg-black/35 transition-opacity duration-fast ${
          revealed || duplicatesOpen ? "opacity-100" : "opacity-0"
        }`}
      />

      {/* clickable face regions -> search by face. The outline stays true
          to the detected bbox; the actual tap target is a separate,
          centered element that never shrinks below a fingertip. */}
      {revealed &&
        faces?.map((face) => (
          <span key={face.id}>
            {/* visual outline: amber fill + glow matching prototype */}
            <span
              aria-hidden
              className="pointer-events-none absolute border-[1.5px] border-accent"
              style={{
                left: `${(face.bbox_x / w) * 100}%`,
                top: `${(face.bbox_y / h) * 100}%`,
                width: `${(face.bbox_w / w) * 100}%`,
                height: `${(face.bbox_h / h) * 100}%`,
                borderRadius: "5px",
                background: "rgba(217,160,91,0.10)",
                boxShadow: "0 0 0 3px rgba(217,160,91,0.12)",
              }}
            />
            <button
              type="button"
              aria-label="Search photos of this person"
              onClick={(e) => {
                e.stopPropagation();
                onFaceSelect(face.id);
              }}
              className="absolute"
              style={{
                left: `${((face.bbox_x + face.bbox_w / 2) / w) * 100}%`,
                top: `${((face.bbox_y + face.bbox_h / 2) / h) * 100}%`,
                width: `max(${(face.bbox_w / w) * 100}%, ${MIN_TAP_TARGET_PX}px)`,
                height: `max(${(face.bbox_h / h) * 100}%, ${MIN_TAP_TARGET_PX}px)`,
                transform: "translate(-50%, -50%)",
              }}
            />
          </span>
        ))}

      {/* metadata revealed with the overlay */}
      <figcaption
        className={`pointer-events-none absolute inset-0 transition-opacity duration-fast ${
          revealed || duplicatesOpen ? "opacity-100" : "opacity-0"
        }`}
      >
        {/* top-left: face count badge — monospace, semi-opaque pill */}
        {revealed && image.face_count > 0 && (
          <span
            className="absolute left-2 top-2 rounded-sm font-mono text-[10px] tracking-[0.04em] text-fg/90"
            style={{ background: "rgba(10,8,6,0.62)", padding: "3px 6px" }}
          >
            {image.face_count} face{image.face_count === 1 ? "" : "s"} · tap a face
          </span>
        )}
        {/* bottom-left: burst pill */}
        {image.duplicate_group && onToggleDuplicates && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleDuplicates(image);
            }}
            className={`pointer-events-auto absolute bottom-2 left-2 rounded-full border px-3 py-1 text-xs backdrop-blur-sm transition-colors duration-fast ${
              duplicatesOpen
                ? "border-accent bg-black/40 text-accent"
                : "border-fg/20 bg-black/30 text-fg/90 hover:border-accent hover:text-accent"
            }`}
          >
            {image.duplicate_group.member_count} shots
          </button>
        )}
      </figcaption>
    </figure>
  );
}
