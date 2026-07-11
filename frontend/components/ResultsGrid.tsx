"use client";

import { useState } from "react";
import Lightbox from "./Lightbox";
import { fullImageUrl, thumbnailUrl } from "@/lib/api-client";
import type { SearchResult } from "@/lib/types";

// Sequential (not parallel) so the browser never sees a burst of
// simultaneous download requests, which some browsers block or prompt on.
const DOWNLOAD_DELAY_MS = 250;
const TOAST_DISMISS_MS = 1200;

function triggerDownload(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/**
 * Search results in the same grid layout as the gallery. Similarity is a
 * monospace amber badge, top-left. Tapping a tile opens the lightbox unless
 * "Select photos" mode is active, in which case it toggles a checkbox for
 * bulk download.
 */
export default function ResultsGrid({
  eventId,
  results,
  onFaceSelect,
}: {
  eventId: string;
  results: SearchResult[];
  onFaceSelect: (faceId: string) => void;
}) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [downloading, setDownloading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  if (results.length === 0) {
    return <p className="text-sm text-muted">No matching photos found.</p>;
  }

  function toggleSelected(imageId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(imageId)) next.delete(imageId);
      else next.add(imageId);
      return next;
    });
  }

  function handleTileClick(imageId: string, index: number) {
    if (selectMode) {
      toggleSelected(imageId);
      return;
    }
    setLightboxIndex(index);
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelected(new Set());
  }

  async function handleBulkDownload() {
    if (downloading || selected.size === 0) return;
    setDownloading(true);
    const ids = Array.from(selected);
    for (let i = 0; i < ids.length; i++) {
      triggerDownload(fullImageUrl(eventId, ids[i]), `photo-${ids[i]}.jpg`);
      setToast(`Downloading ${i + 1} of ${ids.length}…`);
      if (i < ids.length - 1) {
        await new Promise((r) => setTimeout(r, DOWNLOAD_DELAY_MS));
      }
    }
    setToast(`${ids.length} photo${ids.length === 1 ? "" : "s"} downloaded`);
    setDownloading(false);
    window.setTimeout(() => setToast(null), TOAST_DISMISS_MS);
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-4">
        {!selectMode ? (
          <button
            type="button"
            onClick={() => setSelectMode(true)}
            className="text-sm text-muted transition-colors duration-fast hover:text-fg"
          >
            Select photos
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setSelected(new Set(results.map((r) => r.image_id)))}
              className="text-sm text-muted transition-colors duration-fast hover:text-fg"
            >
              Select all
            </button>
            <button
              type="button"
              onClick={exitSelectMode}
              className="text-sm text-muted transition-colors duration-fast hover:text-fg"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={selected.size === 0 || downloading}
              onClick={handleBulkDownload}
              className="rounded-md bg-accent px-4 py-2 text-xs font-medium text-bg transition-colors duration-fast hover:bg-accentHover disabled:cursor-default disabled:opacity-40"
            >
              {downloading ? "Downloading…" : `Download (${selected.size})`}
            </button>
          </>
        )}
      </div>

      <div
        className="grid gap-2.5"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}
      >
        {results.map((result, index) => {
          const isSelected = selected.has(result.image_id);
          return (
            <figure
              key={result.image_id}
              className="group relative cursor-pointer overflow-hidden"
              onClick={() => handleTileClick(result.image_id, index)}
            >
              <img
                src={thumbnailUrl(eventId, result.image_id, 400)}
                alt=""
                loading="lazy"
                className="block aspect-square w-full object-cover"
              />
              <figcaption className="absolute left-2 top-2 rounded-sm bg-black/60 px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-accent backdrop-blur-sm">
                {Math.round(result.similarity * 100)}%
              </figcaption>
              {selectMode && (
                <div
                  className={`absolute inset-0 flex items-start justify-end p-2 transition-colors duration-fast ${
                    isSelected ? "bg-black/40" : "bg-black/0"
                  }`}
                >
                  <span
                    aria-hidden
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] leading-none transition-colors duration-fast ${
                      isSelected
                        ? "border-accent bg-accent text-bg"
                        : "border-fg/50 bg-black/40 text-transparent"
                    }`}
                  >
                    ✓
                  </span>
                </div>
              )}
            </figure>
          );
        })}
      </div>

      {lightboxIndex !== null && (
        <Lightbox
          eventId={eventId}
          items={results.map((r) => ({ id: r.image_id }))}
          index={lightboxIndex}
          totalCount={results.length}
          onIndexChange={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onFaceSelect={(faceId) => {
            setLightboxIndex(null);
            onFaceSelect(faceId);
          }}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full border border-line bg-surface px-4 py-2 text-xs text-fg shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
