import type { Metadata } from "next";
import EventLayoutClient from "@/components/public/EventLayoutClient";
import { resolveSlug } from "@/lib/api-client";

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  try {
    const event = await resolveSlug(params.slug);
    const title = `${event.name}`;
    const description = event.published_at
      ? `Published ${formatDate(event.published_at)}`
      : "Event photo gallery";

    return {
      title,
      description,
      openGraph: {
        title: `${title} | ClairVision`,
        description,
        type: "website",
      },
      twitter: {
        title: `${title} | ClairVision`,
        description,
      },
    };
  } catch (err) {
    // Event not found or not public
    return {
      title: "Event not found",
    };
  }
}

export default function PublicEventLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <EventLayoutClient>{children}</EventLayoutClient>;
}

