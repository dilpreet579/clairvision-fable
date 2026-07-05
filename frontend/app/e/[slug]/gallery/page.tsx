"use client";

import GalleryGrid from "@/components/GalleryGrid";
import { usePublicEvent } from "@/components/public/PublicEventContext";

export default function PublicGalleryPage() {
  const event = usePublicEvent();
  return <GalleryGrid eventId={event.id} searchPath={`/e/${event.slug}/search`} />;
}
