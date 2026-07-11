"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import {
  authButtonClass,
  authErrorClass,
  authInputClass,
} from "@/components/auth/authStyles";

const MIN_PASSWORD_LENGTH = 12;

/**
 * Shared shape of reset-password and accept-invite: a ?token= link from an
 * email plus a new password. Only the copy and the API call differ.
 */
function TokenPasswordFormInner({
  heading,
  intro,
  submitLabel,
  submittingLabel,
  onSubmitToken,
}: {
  heading: string;
  intro: string;
  submitLabel: string;
  submittingLabel: string;
  onSubmitToken: (token: string, password: string) => Promise<void>;
}) {
  const router = useRouter();
  const token = useSearchParams().get("token");

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!token) {
    return (
      <div>
        <h1 className="font-serif text-2xl text-fg">{heading}</h1>
        <p className="mt-4 text-sm text-muted">
          This link is missing its token. Use the full link from your email.
        </p>
      </div>
    );
  }

  const tooShort = password.length > 0 && password.length < MIN_PASSWORD_LENGTH;
  const mismatch = confirm.length > 0 && confirm !== password;
  const ready =
    password.length >= MIN_PASSWORD_LENGTH && confirm === password && !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready || !token) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmitToken(token, password);
      router.push("/login");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setSubmitting(false);
    }
  }

  const labelClass =
    "block text-[11px] font-medium uppercase tracking-[0.1em] text-muted2 mb-1.5";

  return (
    <form onSubmit={handleSubmit} style={{ animation: "cvfade 0.3s ease-out" }}>
      <h1 className="font-serif text-2xl text-fg">{heading}</h1>
      <p className="mt-4 text-sm text-muted">{intro}</p>
      <div className="mt-8 space-y-5">
        <div>
          <label htmlFor="tp-password" className={labelClass}>
            New password
          </label>
          <input
            id="tp-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={`Min ${MIN_PASSWORD_LENGTH} characters`}
            autoComplete="new-password"
            className={authInputClass}
          />
        </div>
        <div>
          <label htmlFor="tp-confirm" className={labelClass}>
            Confirm password
          </label>
          <input
            id="tp-confirm"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Re-enter password"
            autoComplete="new-password"
            className={authInputClass}
          />
        </div>
      </div>
      {tooShort && (
        <p className={`mt-3 text-sm ${authErrorClass}`}>
          Passwords need at least {MIN_PASSWORD_LENGTH} characters.
        </p>
      )}
      {mismatch && (
        <p className={`mt-3 text-sm ${authErrorClass}`}>Passwords don&apos;t match.</p>
      )}
      <button type="submit" disabled={!ready} className={authButtonClass}>
        {submitting ? submittingLabel.replace('...', '…') : submitLabel}
      </button>
      {error && <p className={`mt-3 text-sm ${authErrorClass}`}>{error}</p>}
      <p className="mt-8 text-sm">
        <Link
          href="/login"
          className="text-muted transition-colors duration-fast hover:text-fg"
        >
          Back to login
        </Link>
      </p>
    </form>
  );
}

export default function TokenPasswordForm(
  props: React.ComponentProps<typeof TokenPasswordFormInner>,
) {
  // useSearchParams requires a Suspense boundary during prerender.
  return (
    <Suspense fallback={null}>
      <TokenPasswordFormInner {...props} />
    </Suspense>
  );
}
