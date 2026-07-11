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
      className={`relative text-sm transition-colors duration-fast after:absolute after:-bottom-[1px] after:left-0 after:h-[1px] after:w-full after:rounded-full after:bg-accent after:transition-opacity after:duration-fast ${
        active
          ? "text-fg after:opacity-100"
          : "text-muted after:opacity-0 hover:text-fg"
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
    <header className="border-b border-line">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link
          href="/dashboard"
          className="font-serif text-lg italic tracking-wide text-fg transition-colors duration-fast hover:text-accent"
        >
          ClairVision
        </Link>
        <nav className="flex items-center gap-7">
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
