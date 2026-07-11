import Link from "next/link";

// Chromeless shell for login / forgot-password / reset-password /
// accept-invite: wordmark only, narrow column, no nav.
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto w-full max-w-sm px-4 pb-16 pt-20 sm:px-0">
      <Link href="/" className="font-serif text-lg italic tracking-wide text-fg">
        ClairVision
      </Link>
      <div className="mt-10">{children}</div>
    </main>
  );
}
