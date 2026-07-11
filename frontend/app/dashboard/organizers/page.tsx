"use client";

import { useEffect, useState } from "react";
import { inviteOrganizer, listOrganizers } from "@/lib/api-client";
import type { OrganizerRead } from "@/lib/types";

const inputClass =
  "w-full border-b border-line bg-transparent px-0 py-2.5 text-sm text-fg " +
  "placeholder:text-muted focus:border-accent focus:outline-none " +
  "transition-colors duration-fast";

const labelClass =
  "block text-[11px] font-medium uppercase tracking-[0.1em] text-muted2 mb-1.5";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function OrganizersPage() {
  const [team, setTeam] = useState<OrganizerRead[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [notice, setNotice] = useState<{ text: string; isError: boolean } | null>(null);

  useEffect(() => {
    let cancelled = false;
    listOrganizers()
      .then((data) => {
        if (!cancelled) setTeam(data);
      })
      .catch(() => {
        if (!cancelled) setLoadError("Could not load the team.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || inviting) return;
    setInviting(true);
    setNotice(null);
    try {
      const invitee = await inviteOrganizer(email.trim());
      setTeam((prev) => {
        if (!prev) return prev;
        const without = prev.filter((o) => o.id !== invitee.id);
        return [...without, invitee];
      });
      setNotice({ text: `Invite sent to ${invitee.email}.`, isError: false });
      setEmail("");
    } catch (err) {
      setNotice({
        text: err instanceof Error ? err.message : "Invite failed.",
        isError: true,
      });
    } finally {
      setInviting(false);
    }
  }

  return (
    <div style={{ animation: "cvfade 0.3s ease-out" }}>
      {/* ── Page header ─────────────────────────────── */}
      <div className="border-b border-line pb-8">
        <h1 className="font-serif text-[clamp(1.6rem,3vw,2rem)] text-fg">Team</h1>
        <p className="mt-1 text-sm text-muted">
          Organizer accounts are invite-only — no public sign-up.
        </p>
      </div>

      {/* ── Invite form ──────────────────────────────── */}
      <section className="mt-10 max-w-md">
        <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted2">
          Invite a new organizer
        </p>
        <form onSubmit={handleInvite} className="mt-5">
          <div>
            <label className={labelClass} htmlFor="invite-email">
              Email address
            </label>
            <input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="colleague@example.com"
              className={inputClass}
            />
          </div>
          <button
            type="submit"
            disabled={inviting || !email.trim()}
            className="mt-6 rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-bg transition-colors duration-fast hover:bg-accentHover disabled:cursor-default disabled:opacity-50"
          >
            {inviting ? "Sending…" : "Send invite"}
          </button>
          {notice && (
            <p
              className={`mt-3 text-sm ${notice.isError ? "text-danger" : "text-muted"}`}
            >
              {notice.text}
            </p>
          )}
        </form>
      </section>

      {/* ── Team list ────────────────────────────────── */}
      <section className="mt-12 border-t border-line pt-10">
        <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted2">
          Members
        </p>

        {loadError && (
          <p className="mt-4 text-sm text-muted">{loadError}</p>
        )}

        {/* skeleton */}
        {!loadError && team === null && (
          <ul className="mt-4 divide-y divide-line">
            {[0, 1].map((i) => (
              <li key={i} className="py-4">
                <div className="cv-skeleton h-4 w-52 rounded-sm" />
                <div className="cv-skeleton mt-2 h-3 w-28 rounded-sm" />
              </li>
            ))}
          </ul>
        )}

        {team !== null && team.length === 0 && (
          <p className="mt-4 text-sm text-muted">No team members yet.</p>
        )}

        {team !== null && team.length > 0 && (
          <ul className="mt-4 divide-y divide-line">
            {team.map((organizer) => (
              <li
                key={organizer.id}
                className="flex flex-col gap-1 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 items-baseline gap-3">
                  <span className="text-sm text-fg">{organizer.email}</span>
                  {organizer.is_active ? (
                    <span className="rounded-full border border-accent/40 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-accent">
                      Active
                    </span>
                  ) : (
                    <span className="rounded-full border border-line px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-muted2">
                      Pending
                    </span>
                  )}
                </div>
                <span className="shrink-0 text-xs tabular-nums text-muted2">
                  {formatDate(organizer.created_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
