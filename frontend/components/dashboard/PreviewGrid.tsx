"use client";

import { useCallback, useEffect, useState } from "react";
import GallerySkeleton from "@/components/GallerySkeleton";
import { hideImage, listImages, thumbnailUrl, unhideImage } from "@/lib/api-client";
import type { ImageRead } from "@/lib/types";

const PAGE_SIZE = 24;

/**
 * Organizer-only curation grid: shows ALL selected images including hidden
 * ones (show_hidden=true), with a per-image hide/unhide toggle. Hidden
 * images are dimmed rather than removed so unhiding stays one click away.
 */
export default function PreviewGrid({ eventId }: { eventId: string }) {
  const [images, setImages] = useState<ImageRead[]>([]);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const hasMore = total === null || images.length < total;

  const loadNext = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const next = page + 1;
      const data = await listImages(eventId, next, PAGE_SIZE, true);
      setImages((prev) => (next === 1 ? data.items : [...prev, ...data.items]));
      setPage(next);
      setTotal(data.total);
    } catch {
      setError("Could not load images.");
    } finally {
      setLoading(false);
    }
  }, [eventId, page, loading]);

  useEffect(() => {
    setImages([]);
    setPage(0);
    setTotal(null);
  }, [eventId]);

  useEffect(() => {
    if (page === 0 && !loading) void loadNext();
  }, [page, loading, loadNext]);

  async function toggleHidden(image: ImageRead) {
    if (busyId) return;
    setBusyId(image.id);
    try {
      const updated = image.hidden
        ? await unhideImage(eventId, image.id)
        : await hideImage(eventId, image.id);
      setImages((prev) => prev.map((img) => (img.id === updated.id ? updated : img)));
    } catch {
      setError("Could not update image.");
    } finally {
      setBusyId(null);
    }
  }

  if (page === 0 || (images.length === 0 && loading)) {
    return <GallerySkeleton count={8} />;
  }

  if (images.length === 0) {
    return (
      <p className="text-sm text-muted">
        {error ?? "No curated images for this event yet."}
      </p>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {images.map((image) => (
          <figure key={image.id} className="relative">
            <img
              src={thumbnailUrl(eventId, image.id, 400)}
              alt=""
              loading="lazy"
              className={`block aspect-[4/3] w-full object-cover transition-opacity duration-fast ${
                image.hidden ? "opacity-30" : ""
              }`}
            />
            <figcaption className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/45 p-2">
              <span className="text-xs text-fg/70">
                {image.hidden ? "Hidden" : ""}
              </span>
              <button
                type="button"
                disabled={busyId === image.id}
                onClick={() => toggleHidden(image)}
                className="text-xs text-accent transition-colors duration-fast hover:text-fg disabled:text-muted"
              >
                {busyId === image.id ? "..." : image.hidden ? "Unhide" : "Hide"}
              </button>
            </figcaption>
          </figure>
        ))}
      </div>
      {error && <p className="mt-4 text-sm text-muted">{error}</p>}
      {hasMore && (
        <button
          type="button"
          disabled={loading}
          onClick={() => void loadNext()}
          className="mt-6 text-sm text-accent transition-colors duration-fast hover:text-fg disabled:text-muted"
        >
          {loading ? "Loading..." : "Load more"}
        </button>
      )}
    </div>
  );
}
