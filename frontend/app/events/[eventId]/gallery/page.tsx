"use client";

import { useParams } from "next/navigation";
import GalleryGrid from "@/components/GalleryGrid";

export default function GalleryPage() {
  const { eventId } = useParams<{ eventId: string }>();
  return <GalleryGrid eventId={eventId} />;
}
