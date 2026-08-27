import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateUploadFile, type UploadConstraints } from "@/lib/media-constraints";

/**
 * Uploads a team asset (image or walk-up song), replacing any existing file
 * under the same name prefix regardless of extension — otherwise re-uploading
 * a .wav over an old .mp3 would leave the stale file orphaned in storage,
 * since the paths would differ. Keyed by team_id, not user_id, since
 * teams.custom_image_url / walk_up_song_url are per-team (deviates from
 * docs/AUDIO.md's users/{user_id} example — a user can own different teams
 * across leagues with different songs).
 */
export async function replaceTeamFile(
  bucket: string,
  teamId: string,
  namePrefix: "image" | "song",
  file: File,
  constraints: UploadConstraints
): Promise<string> {
  // Authoritative check — the client-side one in team-edit-form.tsx is only
  // for fast feedback and can't be trusted on its own (a direct POST would
  // skip it entirely).
  const validationError = validateUploadFile(file, constraints);
  if (validationError) {
    throw new Error(validationError);
  }

  const admin = createAdminClient();
  const folder = `teams/${teamId}`;

  await removeTeamFile(bucket, teamId, namePrefix);

  const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
  const path = `${folder}/${namePrefix}.${ext}`;

  const { error } = await admin.storage.from(bucket).upload(path, file, { upsert: true });
  if (error) {
    throw new Error("Upload failed. Please try again.");
  }

  return admin.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

export async function removeTeamFile(
  bucket: string,
  teamId: string,
  namePrefix: "image" | "song"
): Promise<void> {
  const admin = createAdminClient();
  const folder = `teams/${teamId}`;

  const { data: existing } = await admin.storage.from(bucket).list(folder);
  const stale = (existing ?? []).filter((f) => f.name.startsWith(`${namePrefix}.`));
  if (stale.length > 0) {
    await admin.storage.from(bucket).remove(stale.map((f) => `${folder}/${f.name}`));
  }
}
