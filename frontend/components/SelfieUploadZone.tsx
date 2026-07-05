"use client";

import { useRef, useState } from "react";

/**
 * A simple dashed-border rectangle with one line of instruction text.
 * No icons, no illustrations.
 */
export default function SelfieUploadZone({
  onFile,
  disabled,
}: {
  onFile: (file: File) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);

  function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (file && !disabled) onFile(file);
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        handleFiles(e.dataTransfer.files);
      }}
      className={`flex h-32 w-full cursor-pointer items-center justify-center border border-dashed transition-colors duration-fast ${
        dragging ? "border-accent" : "border-muted/50 hover:border-muted"
      }`}
    >
      <p className="px-4 text-center text-sm text-muted">
        Drop a selfie here, or tap to choose a photo of yourself.
      </p>
      {/* capture="user" jumps straight to the front camera on mobile;
          desktop browsers ignore it and open the normal file picker. */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="user"
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
