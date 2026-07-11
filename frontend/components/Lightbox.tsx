"use client";

import { useCallback, useEffect, useState } from "react";
import { fullImageUrl, listFaces } from "@/lib/api-client";
import type { FaceRead } from "@/lib/types";

// Same tap-target floor as ImageCard's face regions — bboxes on a
// full-bleed photo can still be smaller than a fingertip.
const MIN_TAP_TARGET_PX = 44;

export interface LightboxItem {
  id: string;
  /** Member count of the duplicate/burst group this image was picked from. */
  duplicateCount?: number;
}

/**
 * Full-bleed photo viewer shared by the gallery grid and search results.
 * Navigates whatever list of items it's handed — the caller owns pagination
 * (`hasMore`/`onLoadMore`) so this component never has to know whether it's
 * looking at a paginated gallery or a flat list of search results.
 */
export default function Lightbox({
  eventId,
  items,
  index,
  totalCount,
  hasMore = false,
  loadingMore = false,
  onLoadMore,
  onIndexChange,
  onClose,
  onFaceSelect,
}: {
  eventId: string;
  items: LightboxItem[];
  index: number;
  /** Denominator for the "N / total" counter; falls back to items.length. */
  totalCount?: number;
  /** Whether more items can still be loaded past the end of `items`. */
  hasMore?: boolean;
  /** True while a background page-load triggered by reaching the end is in flight. */
  loadingMore?: boolean;
  onLoadMore?: () => void;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  onFaceSelect: (faceId: string) => void;
}) {
  const current = items[index];

  const [faces, setFaces] = useState<FaceRead[] | null>(null);
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    if (!current) return;
    let cancelled = false;
    setFaces(null);
    setNaturalSize(null);
    listFaces(eventId, current.id)
      .then((data) => {
        if (!cancelled) setFaces(data);
      })
      .catch(() => {
        if (!cancelled) setFaces([]);
      });
    return () => {
      cancelled = true;
    };
  }, [eventId, current?.id]);

  const goPrev = useCallback(() => {
    if (index > 0) onIndexChange(index - 1);
    // No backward wrap: index 0 is always the true first item.
  }, [index, onIndexChange]);

  const goNext = useCallback(() => {
    if (index < items.length - 1) {
      onIndexChange(index + 1);
    } else if (hasMore) {
      // Clamp at the boundary but kick off the next page — press next
      // again once it lands. Never silently wrap while more can load.
      onLoadMore?.();
    } else if (items.length > 1) {
      onIndexChange(0);
    }
  }, [index, items.length, hasMore, onLoadMore, onIndexChange]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") goPrev();
      else if (e.key === "ArrowRight") goNext();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [goPrev, goNext, onClose]);

  // Lock background scroll while the overlay is mounted.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  if (!current) return null;

  function handleFaceClick(faceId: string) {
    onClose();
    onFaceSelect(faceId);
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/95"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Photo viewer"
    >
      {/* top bar: close (left) | counter (center) | download (right) — matches prototype */}
      <div
        className="absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-4 p-4 sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="text-2xl leading-none text-muted transition-colors duration-fast hover:text-accent"
        >
          ×
        </button>
        <span className="font-mono text-xs tabular-nums text-muted">
          {index + 1} / {totalCount ?? items.length}
          {loadingMore && <span className="ml-2 italic text-muted2">loading more…</span>}
        </span>
        <a
          href={fullImageUrl(eventId, current.id)}
          download={`photo-${current.id}.jpg`}
          onClick={(e) => e.stopPropagation()}
          className="rounded-md bg-accent px-4 py-2 text-xs font-medium text-bg transition-colors duration-fast hover:bg-accentHover"
        >
          Download
        </a>
      </div>

      {/* prev / next */}
      {index > 0 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            goPrev();
          }}
          aria-label="Previous photo"
          className="absolute left-1 top-1/2 z-10 -translate-y-1/2 p-3 text-3xl text-muted transition-colors duration-fast hover:text-fg sm:left-4"
        >
          ‹
        </button>
      )}
      {(index < items.length - 1 || hasMore || items.length > 1) && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            goNext();
          }}
          aria-label="Next photo"
          className="absolute right-1 top-1/2 z-10 -translate-y-1/2 p-3 text-3xl text-muted transition-colors duration-fast hover:text-fg sm:right-4"
        >
          ›
        </button>
      )}

      {/* content */}
      <div className="flex h-full w-full items-center justify-center p-4 sm:p-10">
        <div className="relative inline-block" onClick={(e) => e.stopPropagation()}>
          <img
            key={current.id}
            src={fullImageUrl(eventId, current.id)}
            alt=""
            onLoad={(e) =>
              setNaturalSize({
                w: e.currentTarget.naturalWidth,
                h: e.currentTarget.naturalHeight,
              })
            }
            className="block h-auto max-h-[75vh] w-auto max-w-[88vw] object-contain sm:max-h-[80vh]"
          />

          {naturalSize &&
            faces?.map((face) => (
              <span key={face.id}>
                {/* amber fill + glow matching gallery face boxes */}
                <span
                  aria-hidden
                  className="pointer-events-none absolute border-[1.5px] border-accent"
                  style={{
                    left: `${(face.bbox_x / naturalSize.w) * 100}%`,
                    top: `${(face.bbox_y / naturalSize.h) * 100}%`,
                    width: `${(face.bbox_w / naturalSize.w) * 100}%`,
                    height: `${(face.bbox_h / naturalSize.h) * 100}%`,
                    borderRadius: "6px",
                    background: "rgba(217,160,91,0.08)",
                    boxShadow: "0 0 0 3px rgba(217,160,91,0.10)",
                  }}
                />
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleFaceClick(face.id);
                  }}
                  aria-label="Search photos of this person"
                  className="absolute"
                  style={{
                    left: `${((face.bbox_x + face.bbox_w / 2) / naturalSize.w) * 100}%`,
                    top: `${((face.bbox_y + face.bbox_h / 2) / naturalSize.h) * 100}%`,
                    width: `max(${(face.bbox_w / naturalSize.w) * 100}%, ${MIN_TAP_TARGET_PX}px)`,
                    height: `max(${(face.bbox_h / naturalSize.h) * 100}%, ${MIN_TAP_TARGET_PX}px)`,
                    transform: "translate(-50%, -50%)",
                  }}
                />
              </span>
            ))}
        </div>
      </div>

      {/* bottom bar: burst note + hint text */}
      <div
        className="absolute inset-x-0 bottom-0 z-10 flex flex-col items-center gap-2 pb-4 pt-2 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        {current.duplicateCount && current.duplicateCount > 1 && (
          <span className="text-xs italic text-muted2">
            Curated pick from a {current.duplicateCount}-photo burst
          </span>
        )}
        <p className="text-[11px] text-muted2">
          Tap a face to find that person · Esc to close
        </p>
      </div>
    </div>
  );
}
