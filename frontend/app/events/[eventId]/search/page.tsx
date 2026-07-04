"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import GallerySkeleton from "@/components/GallerySkeleton";
import ResultsGrid from "@/components/ResultsGrid";
import SelfieUploadZone from "@/components/SelfieUploadZone";
import { searchByFace, searchByUpload } from "@/lib/api-client";
import type { SearchResult } from "@/lib/types";

function SearchPageInner() {
  const { eventId } = useParams<{ eventId: string }>();
  const searchParams = useSearchParams();
  const faceId = searchParams.get("face_id");

  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Entry point B: a face clicked in the gallery arrives as ?face_id=.
  useEffect(() => {
    if (!faceId) return;
    let cancelled = false;
    setSearching(true);
    setError(null);
    setResults(null);
    searchByFace(eventId, faceId)
      .then((data) => {
        if (!cancelled) setResults(data);
      })
      .catch((err) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Search failed.");
      })
      .finally(() => {
        if (!cancelled) setSearching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [eventId, faceId]);

  async function handleFile(file: File) {
    setSearching(true);
    setError(null);
    setResults(null);
    try {
      setResults(await searchByUpload(eventId, file));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed.");
    } finally {
      setSearching(false);
    }
  }

  return (
    <div>
      <SelfieUploadZone onFile={handleFile} disabled={searching} />
      <div className="mt-8">
        {searching && <GallerySkeleton count={8} />}
        {!searching && error && <p className="text-sm text-muted">{error}</p>}
        {!searching && !error && results !== null && (
          <ResultsGrid eventId={eventId} results={results} />
        )}
        {!searching && !error && results === null && (
          <p className="text-sm text-muted">
            Upload a selfie or click a face in the gallery to find your photos.
          </p>
        )}
      </div>
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<GallerySkeleton count={8} />}>
      <SearchPageInner />
    </Suspense>
  );
}
