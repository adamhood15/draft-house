"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { removeTeamFile, replaceTeamFile } from "@/lib/storage";
import { IMAGE_UPLOAD_CONSTRAINTS, SONG_UPLOAD_CONSTRAINTS } from "@/lib/media-constraints";
import type { ClaimState, SettingsState } from "@/lib/leagues/state";

/**
 * Mirrors teams_update's actual RLS permission (owner OR commissioner) so
 * this app-level check isn't stricter than what the database already
 * allows — a commissioner can customize an absent member's team, same as
 * their other admin capabilities elsewhere in the app.
 */
async function requireTeamEditAccess(teamId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("You must be signed in.");
  }

  const { data: team } = await supabase
    .from("teams")
    .select("id, league_id, owner_id")
    .eq("id", teamId)
    .single();

  if (!team) {
    throw new Error("Team not found.");
  }

  if (team.owner_id !== user.id) {
    const { data: league } = await supabase
      .from("leagues")
      .select("commissioner_id")
      .eq("id", team.league_id)
      .single();
    if (league?.commissioner_id !== user.id) {
      throw new Error("You don't have permission to edit this team.");
    }
  }

  return team;
}

/**
 * Claiming an unclaimed team goes through the admin client for the same
 * reason import does (see src/lib/leagues/import.ts): the claimer isn't yet
 * a league member, so teams_update's RLS policy — owner_id = auth.uid() OR
 * is_commissioner(league_id) — can't authorize it. The commissioner claiming
 * their own team *would* pass RLS, but using the admin client uniformly
 * keeps one code path instead of branching by role.
 */
export async function claimTeam(
  leagueId: string,
  _prevState: ClaimState,
  formData: FormData
): Promise<ClaimState> {
  const teamId = String(formData.get("teamId") ?? "");
  if (!teamId) {
    return { error: "Pick a team to claim." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in to claim a team." };
  }

  const admin = createAdminClient();

  // Idempotent: revisiting the invite link (or a double submit) after
  // already claiming should just continue on, not error.
  const { data: existingClaim, error: existingClaimError } = await admin
    .from("teams")
    .select("id")
    .eq("league_id", leagueId)
    .eq("owner_id", user.id)
    .maybeSingle();

  // A discarded error here fails open: `.maybeSingle()` answers duplicate
  // ownership with PGRST116 and a null body (see getUserClaimedTeamId in
  // ./teams.ts), so reading `data` alone lets someone who already owns two
  // teams fall through and claim a third. Never fall through — either they
  // already have a team, or we could not establish that they don't.
  if (existingClaimError) {
    if (existingClaimError.code === "PGRST116") {
      redirect(`/leagues/${leagueId}/lobby`);
    }
    return { error: "Couldn't check your existing teams. Please try again." };
  }

  if (existingClaim) {
    redirect(`/leagues/${leagueId}/lobby`);
  }

  const { data, error } = await admin
    .from("teams")
    .update({ owner_id: user.id })
    .eq("id", teamId)
    .eq("league_id", leagueId)
    .is("owner_id", null)
    .select("id");

  // Post-index (supabase/migrations/20260828000002_teams_one_claim_per_user.sql)
  // a second claim by the same user fails here as a unique violation rather
  // than silently succeeding. That is the same situation the guard above
  // handles, reached by a narrower race — so it gets the same answer.
  // Reporting "someone else took it" would be a false statement about who
  // owns what.
  if (error?.code === "23505") {
    redirect(`/leagues/${leagueId}/lobby`);
  }

  // A genuinely lost race is the zero-rows case specifically: the
  // `.is("owner_id", null)` filter matched nothing because another claimer
  // got there first. Any other error is ours, not theirs.
  if (error) {
    return { error: "Couldn't claim that team. Please try again." };
  }

  if (!data || data.length === 0) {
    return { error: "That team was just claimed by someone else — pick another." };
  }

  // Fresh claim only — prompt customization once, right after claiming (see
  // docs/ARCHITECTURE.md's Player Entry Flow). The idempotent re-visit
  // branch above goes straight to the lobby instead.
  redirect(`/leagues/${leagueId}/team`);
}

/**
 * One combined save for name + image + walk-up song, matching
 * docs/DESIGN.md#18-team-customization-screen's single full-width Save
 * button. Image/song fields are optional — only present in FormData when
 * the user actually picked a new file.
 */
export async function updateTeam(
  leagueId: string,
  teamId: string,
  _prevState: SettingsState,
  formData: FormData
): Promise<SettingsState> {
  try {
    await requireTeamEditAccess(teamId);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Something went wrong." };
  }

  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    return { error: "Team name is required." };
  }

  const updates: Record<string, string> = { draft_house_team_name: name };

  const imageFile = formData.get("image");
  if (imageFile instanceof File && imageFile.size > 0) {
    try {
      updates.custom_image_url = await replaceTeamFile(
        "team-images",
        teamId,
        "image",
        imageFile,
        IMAGE_UPLOAD_CONSTRAINTS
      );
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Image upload failed." };
    }
  }

  const songFile = formData.get("song");
  if (songFile instanceof File && songFile.size > 0) {
    try {
      updates.walk_up_song_url = await replaceTeamFile(
        "walk-up-songs",
        teamId,
        "song",
        songFile,
        SONG_UPLOAD_CONSTRAINTS
      );
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Song upload failed." };
    }
  }

  const supabase = await createClient();
  // `.select("id")` so a zero-row update is distinguishable from a
  // successful one — without it RLS filtering the row out returns the same
  // `{ error: null }` a real save does, and the form reports success for a
  // write that never landed. Same shape as confirmLeagueSetup in ./settings.ts.
  const { data, error } = await supabase
    .from("teams")
    .update(updates)
    .eq("id", teamId)
    .select("id");

  if (error) {
    return { error: "Failed to save team. Please try again." };
  }

  if (!data || data.length === 0) {
    return { error: "Couldn't save your team — you may not have permission to edit it." };
  }

  revalidatePath(`/leagues/${leagueId}/team`);
  return { error: null };
}

export async function removeTeamImage(leagueId: string, teamId: string): Promise<void> {
  await requireTeamEditAccess(teamId);
  await removeTeamFile("team-images", teamId, "image");
  const supabase = await createClient();
  await supabase.from("teams").update({ custom_image_url: null }).eq("id", teamId);
  revalidatePath(`/leagues/${leagueId}/team`);
}

export async function removeWalkUpSong(leagueId: string, teamId: string): Promise<void> {
  await requireTeamEditAccess(teamId);
  await removeTeamFile("walk-up-songs", teamId, "song");
  const supabase = await createClient();
  await supabase.from("teams").update({ walk_up_song_url: null }).eq("id", teamId);
  revalidatePath(`/leagues/${leagueId}/team`);
}
