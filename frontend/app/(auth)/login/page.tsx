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
    <form onSubmit={handleSubmit}>
      <h1 className="font-serif text-2xl text-fg">Organizer login</h1>
      <p className="mt-2 text-sm text-muted">
        Organizer accounts are invite-only.
      </p>
      <div className="mt-6 space-y-4">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          autoComplete="email"
          className={authInputClass}
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          autoComplete="current-password"
          className={authInputClass}
        />
      </div>
      <button
        type="submit"
        disabled={submitting || !email.trim() || !password}
        className={authButtonClass}
      >
        {submitting ? "Signing in..." : "Sign in"}
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
