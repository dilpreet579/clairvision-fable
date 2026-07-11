// Shared class strings for the (auth) pages — same underline-input idiom
// as IngestForm.
export const authInputClass =
  "w-full border-b border-line bg-transparent px-0 py-2 text-sm text-fg " +
  "placeholder:text-muted focus:border-accent focus:outline-none " +
  "transition-colors duration-fast";

// Solid amber pill — same idiom as SelfieUploadZone's "Upload a selfie" CTA
// and the Lightbox download button: this is the primary action on each
// auth page, so it should read as a real button, not a quiet link.
export const authButtonClass =
  "mt-6 rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-bg " +
  "transition-colors duration-fast hover:bg-accentHover " +
  "disabled:cursor-default disabled:opacity-50";

// Genuine error / validation-failure text only — not neutral informational
// copy (e.g. "Check your email", "missing its token" stay text-muted).
export const authErrorClass = "text-danger";
