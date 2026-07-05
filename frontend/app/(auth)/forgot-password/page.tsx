"use client";

import Link from "next/link";
import { useState } from "react";
import { forgotPassword } from "@/lib/api-client";
import { authButtonClass, authInputClass } from "@/components/auth/authStyles";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || submitting) return;
    setSubmitting(true);
    try {
      await forgotPassword(email.trim());
    } catch {
      // The API always answers 202 (anti-enumeration); a network failure
      // still lands on the same neutral confirmation below.
    }
    setSent(true);
    setSubmitting(false);
  }

  if (sent) {
    return (
      <div>
        <h1 className="text-base font-medium">Check your email</h1>
        <p className="mt-4 text-sm text-muted">
          If an organizer account exists for {email.trim()}, a reset link is
          on its way. The link expires in one hour.
        </p>
        <p className="mt-8 text-sm">
          <Link
            href="/login"
            className="text-muted transition-colors duration-fast hover:text-fg"
          >
            Back to login
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <h1 className="text-base font-medium">Reset your password</h1>
      <p className="mt-4 text-sm text-muted">
        Enter your organizer email and we&apos;ll send a reset link.
      </p>
      <div className="mt-6">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          autoComplete="email"
          className={authInputClass}
        />
      </div>
      <button
        type="submit"
        disabled={submitting || !email.trim()}
        className={authButtonClass}
      >
        {submitting ? "Sending..." : "Send reset link"}
      </button>
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
