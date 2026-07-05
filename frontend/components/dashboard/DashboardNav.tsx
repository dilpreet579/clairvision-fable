"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { logout } from "@/lib/api-client";

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

export default function DashboardNav() {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    try {
      await logout();
    } catch {
      // Even if the API call fails the cookie may be gone; land on login
      // either way — the next dashboard request re-checks for real.
    }
    router.push("/login");
  }

  return (
    <header className="border-b border-surface">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link
          href="/dashboard"
          className="text-sm font-medium tracking-wide text-fg"
        >
          ClairVision
        </Link>
        <nav className="flex items-center gap-6">
          <NavLink
            href="/dashboard"
            label="Events"
            active={pathname === "/dashboard"}
          />
          <NavLink
            href="/dashboard/organizers"
            label="Team"
            active={pathname.startsWith("/dashboard/organizers")}
          />
          <button
            type="button"
            onClick={handleLogout}
            className="text-sm text-muted transition-colors duration-fast hover:text-fg"
          >
            Log out
          </button>
        </nav>
      </div>
    </header>
  );
}
