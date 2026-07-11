"use client";

import { useEffect, useState } from "react";
import { getDuplicateGroup, selectGroupImage, thumbnailUrl } from "@/lib/api-client";
import type { DuplicateGroupRead } from "@/lib/types";

/**
 * Inline row expansion below an image's row — plain DOM flow, no modal,
 * no portal, no sidebar. Clicking a member swaps it as the selected frame.
 * The × button collapses the drawer via onCollapse.
 */
export default function DuplicateDrawer({
  eventId,
  groupId,
  onSelected,
  onCollapse,
}: {
  eventId: string;
  groupId: string;
  onSelected: (group: DuplicateGroupRead, newImageId: string) => void;
  /** Called when the user clicks the × to close the drawer. */
  onCollapse?: () => void;
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
    <div
      className="col-span-full rounded-lg border border-line bg-surface"
      style={{ padding: "14px", animation: "cvfade 0.2s ease-out" }}
    >
      {error && <p className="text-sm text-muted">{error}</p>}

      {/* skeleton while loading */}
      {!error && group === null && (
        <div
          className="flex gap-2 overflow-hidden"
          style={{ scrollbarWidth: "none" }}
        >
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="cv-skeleton shrink-0 rounded-sm"
              style={{ width: 196, height: 147 }}
            />
          ))}
        </div>
      )}

      {group && (
        <div>
          {/* header: burst label left, × close right */}
          <div className="mb-3 flex items-center justify-between gap-3">
            <span
              className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted"
              style={{ letterSpacing: "0.08em" }}
            >
              Burst · {group.member_count} frames · keeper bright, rest dimmed

            </span>
            {onCollapse && (
              <button
                type="button"
                onClick={onCollapse}
                aria-label="Collapse burst"
                className="text-lg leading-none text-muted transition-colors duration-fast hover:text-fg"
                style={{ padding: "2px 6px" }}
              >
                ×
              </button>
            )}
          </div>

          {/* horizontal scroll strip — scrollbar hidden */}
          <div
            className="flex gap-2 overflow-x-auto"
            style={{ scrollbarWidth: "none" }}
          >
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
                  className="block rounded-sm object-cover"
                  style={{
                    width: 196,
                    height: 147,
                    opacity: member.is_selected ? 1 : 0.32,
                    transition: "opacity 160ms ease-out",
                    outline: member.is_selected
                      ? "1.5px solid #d9a05b"
                      : undefined,
                    outlineOffset: member.is_selected ? "2px" : undefined,
                  }}
                />
                <span
                  className={`mt-1.5 block font-mono text-[11px] tracking-wide ${member.is_selected ? "text-accent" : "text-muted2"
                    }`}
                >
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
