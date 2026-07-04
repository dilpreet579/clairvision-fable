"use client";

import { useEffect, useState } from "react";
import { getDuplicateGroup, selectGroupImage, thumbnailUrl } from "@/lib/api-client";
import type { DuplicateGroupRead } from "@/lib/types";

/**
 * Inline row expansion below an image's row — plain DOM flow, no modal,
 * no portal, no sidebar. Clicking a member swaps it as the selected frame.
 */
export default function DuplicateDrawer({
  eventId,
  groupId,
  onSelected,
}: {
  eventId: string;
  groupId: string;
  onSelected: (group: DuplicateGroupRead, newImageId: string) => void;
}) {
  const [group, setGroup] = useState<DuplicateGroupRead | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setGroup(null);
    setError(null);
    getDuplicateGroup(eventId, groupId)
      .then((g) => {
        if (!cancelled) setGroup(g);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load this duplicate group.");
      });
    return () => {
      cancelled = true;
    };
  }, [eventId, groupId]);

  async function handlePick(imageId: string) {
    if (!group || imageId === group.selected_image_id) return;
    // optimistic: reflect the swap immediately
    const optimistic: DuplicateGroupRead = {
      ...group,
      selected_image_id: imageId,
      members: group.members.map((m) => ({ ...m, is_selected: m.id === imageId })),
    };
    const previous = group;
    setGroup(optimistic);
    onSelected(optimistic, imageId);
    try {
      const confirmed = await selectGroupImage(eventId, groupId, imageId);
      setGroup(confirmed);
    } catch {
      setGroup(previous);
      onSelected(previous, previous.selected_image_id ?? previous.members[0].id);
      setError("Selection failed — reverted.");
    }
  }

  return (
    <div className="col-span-full py-4">
      {error && <p className="text-sm text-muted">{error}</p>}
      {!error && group === null && (
        <div className="flex gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="cv-skeleton h-24 w-36" />
          ))}
        </div>
      )}
      {group && (
        <div>
          <p className="mb-3 text-xs text-muted">
            {group.member_count} shots in this burst — click one to make it the
            selected frame.
          </p>
          <div className="flex gap-3 overflow-x-auto">
            {group.members.map((member) => (
              <button
                key={member.id}
                type="button"
                onClick={() => handlePick(member.id)}
                className="shrink-0 text-left"
              >
                <img
                  src={thumbnailUrl(eventId, member.id, 240)}
                  alt=""
                  className={`block h-24 w-36 object-cover transition-opacity duration-fast ${
                    member.is_selected
                      ? "opacity-100 outline outline-1 outline-accent"
                      : "opacity-70 hover:opacity-100"
                  }`}
                />
                <span className="mt-1 block text-[11px] text-muted">
                  {member.is_selected
                    ? "selected"
                    : member.nima_score != null
                      ? `quality ${member.nima_score.toFixed(1)}`
                      : ""}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
