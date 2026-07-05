"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const REMOVAL_MAILTO =
  "mailto:dilpreet082023@gmail.com?subject=Photo%20removal%20request";

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

/** Per-event public header: event name + the three viewer tabs, and the
 * removal-request mailto (decision 12: no in-app queue). */
export default function PublicEventNav({
  slug,
  eventName,
}: {
  slug: string;
  eventName: string;
}) {
  const pathname = usePathname();
  const base = `/e/${slug}`;

  return (
    <header className="border-b border-surface">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link
          href="/"
          className="truncate text-sm font-medium tracking-wide text-fg"
          title={eventName}
        >
          {eventName}
        </Link>
        <nav className="flex shrink-0 items-center gap-4 sm:gap-6">
          <NavLink
            href={`${base}/gallery`}
            label="Gallery"
            active={pathname.endsWith("/gallery")}
          />
          <NavLink
            href={`${base}/search`}
            label="Search"
            active={pathname.endsWith("/search")}
          />
          <NavLink
            href={`${base}/cluster`}
            label="Cluster"
            active={pathname.endsWith("/cluster")}
          />
          <a
            href={REMOVAL_MAILTO}
            className="hidden text-sm text-muted transition-colors duration-fast hover:text-fg sm:inline"
          >
            Removal request
          </a>
        </nav>
      </div>
    </header>
  );
}
