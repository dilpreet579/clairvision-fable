"use client";

import dynamic from "next/dynamic";
import { useParams } from "next/navigation";

// Three.js needs window — load the whole view client-side only.
const ClusterView = dynamic(() => import("@/components/cluster/ClusterView"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[calc(100vh-9.5rem)] min-h-[420px] items-center justify-center">
      <span className="cv-dot" aria-hidden />
    </div>
  ),
});

export default function ClusterPage() {
  const { eventId } = useParams<{ eventId: string }>();
  return <ClusterView eventId={eventId} />;
}
