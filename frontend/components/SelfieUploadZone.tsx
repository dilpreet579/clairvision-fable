"use client";

import { useRef, useState } from "react";

/**
 * Centered dashed-border card: a serif invitation, one line of privacy
 * copy, and two entry points into the same file input flow — upload from
 * the library, or jump straight to the front camera on mobile.
 */
export default function SelfieUploadZone({
  onFile,
  disabled,
}: {
  onFile: (file: File) => void;
  disabled?: boolean;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);

  function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (file && !disabled) onFile(file);
  }

  return (
    <div
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
      className={`flex flex-col items-center gap-5 rounded-lg border border-dashed px-6 py-16 text-center transition-colors duration-fast ${
        dragging ? "border-accent" : "border-line"
      }`}
    >
      <div>
        <h2 className="font-serif text-2xl italic text-fg sm:text-[1.75rem]">
          Find every photo of you
        </h2>
        <p className="mx-auto mt-3 max-w-[38ch] text-sm text-muted">
          Nothing is stored — your selfie is matched and immediately
          discarded.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          disabled={disabled}
          onClick={() => fileInputRef.current?.click()}
          className="rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-bg transition-colors duration-fast hover:bg-accentHover disabled:cursor-default disabled:opacity-50"
        >
          Upload a selfie
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => cameraInputRef.current?.click()}
          className="rounded-full border border-line px-5 py-2.5 text-sm text-fg transition-colors duration-fast hover:border-accent hover:text-accent disabled:cursor-default disabled:opacity-50"
        >
          Use camera
        </button>
      </div>

      <p className="text-xs text-muted2">or drag and drop a photo here</p>

      {/* library / general picker — no capture attr */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
      {/* capture="user" jumps straight to the front camera on mobile;
          desktop browsers ignore it and open the normal file picker. */}
      <input
        ref={cameraInputRef}
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
