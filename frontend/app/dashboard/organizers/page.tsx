"use client";

import { useEffect, useState } from "react";
import { inviteOrganizer, listOrganizers } from "@/lib/api-client";
import type { OrganizerRead } from "@/lib/types";

const inputClass =
  "w-full border-b border-surface bg-transparent px-0 py-2 text-sm text-fg " +
  "placeholder:text-muted focus:border-accent focus:outline-none " +
  "transition-colors duration-fast";

export default function OrganizersPage() {
  const [team, setTeam] = useState<OrganizerRead[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

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
      setNotice(`Invite sent to ${invitee.email}.`);
      setEmail("");
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Invite failed.");
    } finally {
      setInviting(false);
    }
  }

  return (
    <div>
      <h1 className="text-base font-medium">Invite an organizer</h1>
      <form onSubmit={handleInvite} className="mt-4 max-w-md">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className={inputClass}
        />
        <button
          type="submit"
          disabled={inviting || !email.trim()}
          className="mt-5 text-sm text-accent transition-colors duration-fast hover:text-fg disabled:cursor-default disabled:text-muted"
        >
          {inviting ? "Sending invite..." : "Send invite"}
        </button>
        {notice && <p className="mt-3 text-sm text-muted">{notice}</p>}
      </form>

      <h2 className="mt-14 text-base font-medium">Team</h2>
      <div className="mt-4">
        {loadError && <p className="text-sm text-muted">{loadError}</p>}
        {!loadError && team === null && (
          <ul className="divide-y divide-surface">
            {[0, 1].map((i) => (
              <li key={i} className="py-4">
                <div className="cv-skeleton h-4 w-56 rounded-sm" />
              </li>
            ))}
          </ul>
        )}
        {team !== null && (
          <ul className="divide-y divide-surface">
            {team.map((organizer) => (
              <li
                key={organizer.id}
                className="flex flex-col gap-1 py-4 sm:flex-row sm:items-baseline sm:justify-between"
              >
                <span className="text-sm text-fg">{organizer.email}</span>
                <span className="text-sm text-muted">
                  {organizer.is_active ? "Active" : "Invited — pending"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
