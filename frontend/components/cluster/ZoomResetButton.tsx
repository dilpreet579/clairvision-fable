"use client";

/**
 * The single control allowed on the cluster canvas: a minimal text button,
 * top-right corner. No icons.
 */
export default function ZoomResetButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute right-3 top-3 z-10 text-xs text-muted transition-colors duration-fast hover:text-fg"
    >
      Reset zoom
    </button>
  );
}
