"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { login } from "@/lib/api-client";
import {
  authButtonClass,
  authErrorClass,
  authInputClass,
} from "@/components/auth/authStyles";

const labelClass =
  "block text-[11px] font-medium uppercase tracking-[0.1em] text-muted2 mb-1.5";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await login(email.trim(), password);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ animation: "cvfade 0.3s ease-out" }}>
      <h1 className="font-serif text-2xl text-fg">Sign in</h1>
      <p className="mt-2 text-sm text-muted">Organizer accounts are invite-only.</p>

      <div className="mt-8 space-y-5">
        <div>
          <label htmlFor="login-email" className={labelClass}>
            Email
          </label>
          <input
            id="login-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            className={authInputClass}
          />
        </div>
        <div>
          <label htmlFor="login-password" className={labelClass}>
            Password
          </label>
          <input
            id="login-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
            className={authInputClass}
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={submitting || !email.trim() || !password}
        className={authButtonClass}
      >
        {submitting ? "Signing in…" : "Sign in"}
      </button>

      {error && <p className={`mt-3 text-sm ${authErrorClass}`}>{error}</p>}

      <p className="mt-8 text-sm">
        <Link
          href="/forgot-password"
          className="text-muted transition-colors duration-fast hover:text-fg"
        >
          Forgot password?
        </Link>
      </p>
    </form>
  );
}
