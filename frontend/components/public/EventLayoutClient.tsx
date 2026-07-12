"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { PublicEventProvider } from "@/components/public/PublicEventContext";
import { resolveSlug } from "@/lib/api-client";
import type { PublicEventSummary } from "@/lib/types";

// Resolves the slug exactly once for the whole /e/[slug] tree; children
// get the event (incl. id) via context. Unpublished events 404 at the
// API for anonymous viewers, which lands in the not-found branch here.
export default function EventLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const { slug } = useParams<{ slug: string }>();
  const [event, setEvent] = useState<PublicEventSummary | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setEvent(null);
    setNotFound(false);
    resolveSlug(slug)
      .then((data) => {
        if (!cancelled) setEvent(data);
      })
      .catch(() => {
        if (!cancelled) setNotFound(true);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (notFound) {
    return (
      <main className="mx-auto w-full max-w-6xl px-4 pt-20 sm:px-6">
        <h1 className="text-base font-medium">Event not found</h1>
        <p className="mt-4 text-sm text-muted">
          This event doesn&apos;t exist or isn&apos;t public.
        </p>
        <p className="mt-8 text-sm">
          <Link
            href="/"
            className="text-muted transition-colors duration-fast hover:text-fg"
          >
            Browse events
          </Link>
        </p>
      </main>
    );
  }

  if (event === null) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <span className="cv-dot" aria-hidden />
      </div>
    );
  }

  return (
    <PublicEventProvider value={event}>
      <main className="mx-auto w-full max-w-6xl px-4 pb-16 pt-10 sm:px-6">
        {children}
      </main>
    </PublicEventProvider>
  );
}
