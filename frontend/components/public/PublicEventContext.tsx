"use client";

import { createContext, useContext } from "react";
import type { PublicEventSummary } from "@/lib/types";

// Filled once by the /e/[slug] layout after resolving the slug; the
// gallery/search/cluster pages beneath read the event id from here so
// every downstream call stays on the existing id-based endpoints.
const PublicEventContext = createContext<PublicEventSummary | null>(null);

export const PublicEventProvider = PublicEventContext.Provider;

export function usePublicEvent(): PublicEventSummary {
  const event = useContext(PublicEventContext);
  if (!event) {
    throw new Error("usePublicEvent must be used inside /e/[slug] pages");
  }
  return event;
}
