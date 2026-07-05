"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import DuplicateDrawer from "./DuplicateDrawer";
import GallerySkeleton from "./GallerySkeleton";
import ImageCard from "./ImageCard";
import { listImages } from "@/lib/api-client";
import type { DuplicateGroupRead, ImageRead } from "@/lib/types";

const PAGE_SIZE = 24;

export default function GalleryGrid({
  eventId,
  searchPath,
}: {
  eventId: string;
  /** Search-page route of the hosting tree, passed through to ImageCard. */
  searchPath: string;
}) {
  const [images, setImages] = useState<ImageRead[]>([]);
  const [page, setPage] = useState(0); // last loaded page
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedGroup, setExpandedGroup] = useState<{
    groupId: string;
    imageId: string;
  } | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const hasMore = total === null || images.length < total;

  const loadNext = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const next = page + 1;
      const data = await listImages(eventId, next, PAGE_SIZE);
      setImages((prev) => (next === 1 ? data.items : [...prev, ...data.items]));
      setPage(next);
      setTotal(data.total);
    } catch {
      setError("Could not load images.");
    } finally {
      setLoading(false);
    }
  }, [eventId, page, loading]);

  // initial load
  useEffect(() => {
    setImages([]);
    setPage(0);
    setTotal(null);
    setExpandedGroup(null);
  }, [eventId]);

  useEffect(() => {
    if (page === 0 && !loading) void loadNext();
  }, [page, loading, loadNext]);

  // infinite scroll via sentinel — no visible pagination controls
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loading) void loadNext();
      },
      { rootMargin: "600px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loading, loadNext]);

  const handleToggleDuplicates = useCallback((image: ImageRead) => {
    const groupId = image.duplicate_group?.id;
    if (!groupId) return;
    setExpandedGroup((prev) =>
      prev?.groupId === groupId ? null : { groupId, imageId: image.id },
    );
  }, []);

  const handleSelected = useCallback(
    (group: DuplicateGroupRead, newImageId: string) => {
      // swap the selected frame into the grid immediately (optimistic)
      setImages((prev) =>
        prev.map((img) => {
          if (img.duplicate_group?.id !== group.id || img.id === newImageId)
            return img;
          const member = group.members.find((m) => m.id === newImageId);
          return {
            ...img,
            id: newImageId,
            width: member?.width ?? img.width,
            height: member?.height ?? img.height,
          };
        }),
      );
      setExpandedGroup((prev) =>
        prev?.groupId === group.id ? { ...prev, imageId: newImageId } : prev,
      );
    },
    [],
  );

  if (page === 0 || (images.length === 0 && loading)) {
    return <GallerySkeleton count={PAGE_SIZE} />;
  }

  if (images.length === 0 && !loading) {
    return (
      <p className="text-sm text-muted">
        {error ?? "No curated images for this event yet."}
      </p>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {images.map((image) => (
          <Fragment key={image.duplicate_group?.id ?? image.id}>
            <ImageCard
              eventId={eventId}
              image={image}
              searchPath={searchPath}
              onToggleDuplicates={handleToggleDuplicates}
              duplicatesOpen={expandedGroup?.groupId === image.duplicate_group?.id}
            />
            {/* inline row expansion, plain DOM flow below the clicked image */}
            {expandedGroup !== null &&
              image.duplicate_group?.id === expandedGroup.groupId && (
                <DuplicateDrawer
                  eventId={eventId}
                  groupId={expandedGroup.groupId}
                  onSelected={handleSelected}
                />
              )}
          </Fragment>
        ))}
      </div>
      {loading && (
        <div className="mt-3">
          <GallerySkeleton count={4} />
        </div>
      )}
      {error && <p className="mt-4 text-sm text-muted">{error}</p>}
      <div ref={sentinelRef} aria-hidden />
    </div>
  );
}
