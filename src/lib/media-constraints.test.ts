import { describe, expect, it } from "vitest";
import {
  IMAGE_UPLOAD_CONSTRAINTS,
  SONG_UPLOAD_CONSTRAINTS,
  validateUploadFile,
} from "@/lib/media-constraints";

/**
 * Characterization tests for the upload allow-list documented in
 * docs/AUDIO.md#upload-technical-details. These lock in the MIME-or-extension
 * rule, which is the part most likely to be "simplified" into MIME-only by
 * someone reading the constraints list without the surrounding prose.
 */

const file = (name: string, type: string, size = 1024) => ({ name, type, size });

describe("validateUploadFile — songs", () => {
  it("accepts a file whose MIME type is on the allow-list", () => {
    expect(validateUploadFile(file("walkup.mp3", "audio/mpeg"), SONG_UPLOAD_CONSTRAINTS)).toBeNull();
  });

  it("accepts a recognized extension when the browser reports no MIME type", () => {
    // m4a is the motivating case: browsers report audio/mp4, audio/x-m4a, or
    // nothing at all, so the extension has to be sufficient on its own.
    expect(validateUploadFile(file("walkup.m4a", ""), SONG_UPLOAD_CONSTRAINTS)).toBeNull();
  });

  it("accepts a recognized MIME type when the extension is unfamiliar", () => {
    expect(validateUploadFile(file("walkup.bin", "audio/ogg"), SONG_UPLOAD_CONSTRAINTS)).toBeNull();
  });

  it("rejects only when neither the MIME type nor the extension matches", () => {
    const error = validateUploadFile(file("roster.pdf", "application/pdf"), SONG_UPLOAD_CONSTRAINTS);
    expect(error).toContain(".pdf");
    expect(error).toContain("MP3, WAV, OGG, or AAC");
  });

  it("rejects a file over the 10MB limit even when the format is valid", () => {
    const tooBig = file("walkup.mp3", "audio/mpeg", 10 * 1024 * 1024 + 1);
    expect(validateUploadFile(tooBig, SONG_UPLOAD_CONSTRAINTS)).toBe(
      "File exceeds the 10MB limit."
    );
  });

  it("accepts a file exactly at the limit", () => {
    const exact = file("walkup.mp3", "audio/mpeg", 10 * 1024 * 1024);
    expect(validateUploadFile(exact, SONG_UPLOAD_CONSTRAINTS)).toBeNull();
  });
});

describe("validateUploadFile — images", () => {
  it("accepts a PNG", () => {
    expect(validateUploadFile(file("logo.png", "image/png"), IMAGE_UPLOAD_CONSTRAINTS)).toBeNull();
  });

  it("rejects an audio file against the image constraints", () => {
    expect(
      validateUploadFile(file("walkup.mp3", "audio/mpeg"), IMAGE_UPLOAD_CONSTRAINTS)
    ).toContain("JPG, PNG, WebP, or GIF");
  });

  it("rejects a file over the 5MB image limit", () => {
    const tooBig = file("logo.png", "image/png", 5 * 1024 * 1024 + 1);
    expect(validateUploadFile(tooBig, IMAGE_UPLOAD_CONSTRAINTS)).toBe(
      "File exceeds the 5MB limit."
    );
  });
});
