/**
 * Shared between the client form (immediate feedback on file-select) and
 * the server action/storage helper (authoritative check) — one source so
 * the two can't drift into disagreeing about what's a valid upload.
 */

export type UploadConstraints = {
  maxBytes: number;
  allowedMimeTypes: string[];
  allowedExtensions: string[];
  label: string;
};

export const IMAGE_UPLOAD_CONSTRAINTS: UploadConstraints = {
  maxBytes: 5 * 1024 * 1024,
  allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  allowedExtensions: ["jpg", "jpeg", "png", "webp", "gif"],
  label: "JPG, PNG, WebP, or GIF",
};

// docs/AUDIO.md#upload-technical-details. m4a's MIME type is reported
// inconsistently across browsers (audio/mp4, audio/x-m4a, or blank), so
// both the type and extension lists include it as a fallback signal.
export const SONG_UPLOAD_CONSTRAINTS: UploadConstraints = {
  maxBytes: 10 * 1024 * 1024,
  allowedMimeTypes: [
    "audio/mpeg",
    "audio/wav",
    "audio/x-wav",
    "audio/ogg",
    "audio/aac",
    "audio/mp4",
    "audio/x-m4a",
  ],
  allowedExtensions: ["mp3", "wav", "ogg", "aac", "m4a"],
  label: "MP3, WAV, OGG, or AAC",
};

/** Returns a user-facing error message, or null if the file is valid. */
export function validateUploadFile(
  file: { name: string; type: string; size: number },
  constraints: UploadConstraints
): string | null {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const typeRecognized = constraints.allowedMimeTypes.includes(file.type);
  const extensionRecognized = constraints.allowedExtensions.includes(extension);

  // Browsers don't always report a MIME type (or report an inconsistent
  // one) for less common formats, so a recognized extension is enough on
  // its own — only reject when *neither* signal matches.
  if (!typeRecognized && !extensionRecognized) {
    return `Unsupported file${extension ? ` (.${extension})` : ""} — please upload ${constraints.label}.`;
  }
  if (file.size > constraints.maxBytes) {
    return `File exceeds the ${Math.round(constraints.maxBytes / (1024 * 1024))}MB limit.`;
  }
  return null;
}
