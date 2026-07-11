"use client";

import Link from "next/link";
import { useState } from "react";
import GalleryGrid from "@/components/GalleryGrid";
import ResultsGrid from "@/components/ResultsGrid";
import SelfieUploadZone from "@/components/SelfieUploadZone";
import { usePublicEvent } from "@/components/public/PublicEventContext";
import { searchByFace, searchByUpload } from "@/lib/api-client";
import type { SearchResult } from "@/lib/types";

const REMOVAL_MAILTO =
  "mailto:dilpreet082023@gmail.com?subject=Photo%20removal%20request";

type Tab = "gallery" | "search";
type SearchOrigin = "upload" | "face";

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function TabButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`border-b-2 pb-3 text-sm transition-colors duration-fast ${
        active ? "border-accent text-fg" : "border-transparent text-muted hover:text-fg"
      }`}
    >
      {label}
    </button>
  );
}

/** Centered "scanning" state — a sweeping bar, no fabricated face counts. */
function ScanningCard() {
  return (
    <div className="flex flex-col items-center gap-4 rounded-lg border border-line px-6 py-16 text-center">
      <p className="font-serif text-xl italic text-fg">Looking for you…</p>
      <div className="h-1 w-48 overflow-hidden rounded-full bg-line">
        <div
          className="h-full w-1/3 rounded-full bg-accent"
          style={{ animation: "cvsweep 1.6s ease-in-out infinite" }}
        />
      </div>
      <p className="text-xs text-muted2">Matching against this event's photos.</p>
    </div>
  );
}

export default function PublicEventPage() {
  const event = usePublicEvent();
  const eventId = event.id;

  const [tab, setTab] = useState<Tab>("gallery");

  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [origin, setOrigin] = useState<SearchOrigin | null>(null);

  function runFaceSearch(faceId: string) {
    setTab("search");
    setOrigin("face");
    setSearching(true);
    setSearchError(null);
    setResults(null);
    searchByFace(eventId, faceId)
      .then(setResults)
      .catch((err) => setSearchError(err instanceof Error ? err.message : "Search failed."))
      .finally(() => setSearching(false));
  }

  function runUploadSearch(file: File) {
    setOrigin("upload");
    setSearching(true);
    setSearchError(null);
    setResults(null);
    searchByUpload(eventId, file)
      .then(setResults)
      .catch((err) => setSearchError(err instanceof Error ? err.message : "Search failed."))
      .finally(() => setSearching(false));
  }

  function clearSearch() {
    setResults(null);
    setSearchError(null);
    setOrigin(null);
    setSearching(false);
  }

  return (
    <div>
      {/* back-link row + wordmark */}
      <div className="flex items-center justify-between gap-4">
        <Link
          href="/"
          className="text-sm text-muted transition-colors duration-fast hover:text-fg"
        >
          ← All events
        </Link>
        <span className="font-serif text-lg italic tracking-wide text-fg">ClairVision</span>
      </div>

      {/* event name + subheader */}
      <div className="mt-10">
        <h1 className="max-w-[24ch] font-serif text-[clamp(2rem,5vw,2.75rem)] leading-[1.1] text-fg">
          {event.name}
        </h1>
        {event.published_at && (
          <p className="mt-2 text-sm text-muted">Published {formatDate(event.published_at)}</p>
        )}
      </div>

      {/* tabs */}
      <div className="mt-10 flex items-center gap-6 border-b border-line">
        <TabButton label="Gallery" active={tab === "gallery"} onClick={() => setTab("gallery")} />
        <TabButton
          label="Find my photos"
          active={tab === "search"}
          onClick={() => setTab("search")}
        />
      </div>

      <div className="mt-8">
        {/* Kept mounted (just hidden) rather than conditionally rendered —
            switching tabs is in-memory state, not a navigation, so the
            gallery's loaded pages/scroll position and any in-flight search
            must survive hopping back and forth. */}
        <div className={tab === "gallery" ? "" : "hidden"}>
          <GalleryGrid eventId={eventId} onFaceSelect={runFaceSearch} />
        </div>

        <div className={tab === "search" ? "" : "hidden"}>
          {!searching && results === null && !searchError && (
            <div>
              <SelfieUploadZone onFile={runUploadSearch} disabled={searching} />
              <p className="mt-4 text-center text-xs text-muted2">
                Or tap a face on any photo in the Gallery tab to search by them.
              </p>
            </div>
          )}

          {searching && <ScanningCard />}

          {!searching && searchError && (
            <div className="rounded-lg border border-line px-6 py-10 text-center">
              <p className="text-sm text-muted">{searchError}</p>
              <button
                type="button"
                onClick={clearSearch}
                className="mt-4 text-sm text-accent transition-colors duration-fast hover:text-fg"
              >
                Try again
              </button>
            </div>
          )}

          {!searching && !searchError && results !== null && (
            <div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs text-muted">
                  {origin === "upload" ? "Matches for your selfie" : "Matches for the face you selected"}
                </span>
                <button
                  type="button"
                  onClick={clearSearch}
                  className="text-sm text-muted transition-colors duration-fast hover:text-fg"
                >
                  Clear
                </button>
              </div>
              <p className="mt-3 text-sm text-muted">
                {results.length} photo{results.length === 1 ? "" : "s"}, ranked by match
                confidence — only likely matches are shown.
              </p>
              <div className="mt-6">
                <ResultsGrid eventId={eventId} results={results} onFaceSelect={runFaceSearch} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* footer: removal-request mailto (decision: no in-app queue) */}
      <footer className="mt-16 border-t border-line pt-6">
        <p className="text-xs text-muted2">
          Photos are searchable only within this event. Want a photo of you
          removed?{" "}
          <a
            href={REMOVAL_MAILTO}
            className="text-muted underline underline-offset-2 transition-colors duration-fast hover:text-fg"
          >
            Contact the organizer
          </a>
          .
        </p>
      </footer>
    </div>
  );
}
