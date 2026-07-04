"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";

function NavLink({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`border-b pb-0.5 text-sm transition-colors duration-fast ${
        active
          ? "border-fg text-fg"
          : "border-transparent text-muted hover:text-fg"
      }`}
    >
      {label}
    </Link>
  );
}

export default function TopNav() {
  const pathname = usePathname();
  const params = useParams<{ eventId?: string }>();
  const eventId = params?.eventId;

  return (
    <header className="border-b border-surface">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/events" className="text-sm font-medium tracking-wide text-fg">
          ClairVision
        </Link>
        <nav className="flex items-center gap-6">
          <NavLink
            href="/events"
            label="Events"
            active={pathname === "/events"}
          />
          {eventId && (
            <>
              <NavLink
                href={`/events/${eventId}/gallery`}
                label="Gallery"
                active={pathname.endsWith("/gallery")}
              />
              <NavLink
                href={`/events/${eventId}/search`}
                label="Search"
                active={pathname.endsWith("/search")}
              />
              <NavLink
                href={`/events/${eventId}/cluster`}
                label="Cluster"
                active={pathname.endsWith("/cluster")}
              />
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
