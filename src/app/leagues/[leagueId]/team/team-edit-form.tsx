"use client";

import { useActionState, useState, useTransition } from "react";
import type { ChangeEvent } from "react";
import { ImageIcon, Music, Save, Trash2 } from "lucide-react";
import { updateTeam, removeTeamImage, removeWalkUpSong } from "@/lib/leagues/team-actions";
import { initialSettingsState } from "@/lib/leagues/state";
import {
  IMAGE_UPLOAD_CONSTRAINTS,
  SONG_UPLOAD_CONSTRAINTS,
  validateUploadFile,
} from "@/lib/media-constraints";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type Team = {
  id: string;
  draft_house_team_name: string;
  team_image_url: string | null;
  custom_image_url: string | null;
  walk_up_song_url: string | null;
};

export function TeamEditForm({ leagueId, team }: { leagueId: string; team: Team }) {
  const action = updateTeam.bind(null, leagueId, team.id);
  const [state, formAction] = useActionState(action, initialSettingsState);

  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [songPreview, setSongPreview] = useState<{ name: string; url: string } | null>(null);
  const [songError, setSongError] = useState<string | null>(null);
  const [isRemovingImage, startRemoveImage] = useTransition();
  const [isRemovingSong, startRemoveSong] = useTransition();

  const currentImage = imagePreview ?? team.custom_image_url ?? team.team_image_url;
  const currentSongUrl = songPreview?.url ?? team.walk_up_song_url;

  // Validates immediately on file-select rather than waiting for the round
  // trip to the server action, and clears the input on failure — e.target.value
  // = "" — so an invalid file can never actually be part of the submission,
  // not just visually flagged as one.
  function handleImageChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) {
      setImagePreview(null);
      setImageError(null);
      return;
    }
    const error = validateUploadFile(file, IMAGE_UPLOAD_CONSTRAINTS);
    if (error) {
      setImageError(error);
      setImagePreview(null);
      e.target.value = "";
      return;
    }
    setImageError(null);
    setImagePreview(URL.createObjectURL(file));
  }

  function handleSongChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) {
      setSongPreview(null);
      setSongError(null);
      return;
    }
    const error = validateUploadFile(file, SONG_UPLOAD_CONSTRAINTS);
    if (error) {
      setSongError(error);
      setSongPreview(null);
      e.target.value = "";
      return;
    }
    setSongError(null);
    setSongPreview({ name: file.name, url: URL.createObjectURL(file) });
  }

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <Input label="Team Name" name="name" defaultValue={team.draft_house_team_name} required />

      <div className="flex flex-col gap-2">
        <span className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-ink/80">
          <ImageIcon size={14} strokeWidth={2.4} />
          Team Image
        </span>
        <label className="flex h-28 w-28 cursor-pointer items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-ink bg-background">
          {currentImage ? (
            // eslint-disable-next-line @next/next/no-img-element -- user-uploaded/Sleeper CDN image, not worth next/image's remote-pattern config
            <img src={currentImage} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="flex flex-col items-center gap-1 text-ink/50">
              <ImageIcon size={20} strokeWidth={2} />
              <span className="text-[10px] font-bold uppercase">Team Image</span>
            </span>
          )}
          <input
            type="file"
            name="image"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={handleImageChange}
          />
        </label>
        {imageError && (
          <p role="alert" className="text-xs font-semibold text-pink">
            {imageError}
          </p>
        )}
        {team.custom_image_url && !imagePreview && (
          <button
            type="button"
            disabled={isRemovingImage}
            onClick={() => startRemoveImage(() => removeTeamImage(leagueId, team.id))}
            className="flex items-center gap-1 text-xs font-bold text-pink underline disabled:opacity-60"
          >
            <Trash2 size={12} strokeWidth={2.4} /> Remove custom image
          </button>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <span className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-ink/80">
          <Music size={14} strokeWidth={2.4} />
          Walk-Up Song
        </span>
        <label className="cursor-pointer rounded-lg border-2 border-dashed border-ink bg-background px-4 py-3 text-center text-sm text-ink/60">
          {songPreview
            ? songPreview.name
            : team.walk_up_song_url
              ? "Replace song"
              : "Upload a song (MP3, WAV, OGG, AAC — max 10MB)"}
          <input
            type="file"
            name="song"
            accept="audio/mpeg,audio/wav,audio/x-wav,audio/ogg,audio/aac,audio/mp4,audio/x-m4a,.m4a"
            className="hidden"
            onChange={handleSongChange}
          />
        </label>
        {songError && (
          <p role="alert" className="text-xs font-semibold text-pink">
            {songError}
          </p>
        )}
        {currentSongUrl && <audio controls src={currentSongUrl} className="w-full" />}
        {team.walk_up_song_url && !songPreview && (
          <button
            type="button"
            disabled={isRemovingSong}
            onClick={() => startRemoveSong(() => removeWalkUpSong(leagueId, team.id))}
            className="flex items-center gap-1 text-xs font-bold text-pink underline disabled:opacity-60"
          >
            <Trash2 size={12} strokeWidth={2.4} /> Remove song
          </button>
        )}
      </div>

      {state.error && (
        <p role="alert" className="text-sm font-semibold text-pink">
          {state.error}
        </p>
      )}

      <Button type="submit" className="w-full">
        <Save size={14} strokeWidth={2.4} />
        Save Team
      </Button>
    </form>
  );
}
