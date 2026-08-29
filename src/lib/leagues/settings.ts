"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isDraftOrderType } from "@/lib/draft/order";
import type { SettingsState } from "@/lib/leagues/state";

// Unlike import (see src/lib/leagues/import.ts), these are plain authenticated
// writes — leagues_update/draft_settings_update RLS policies already restrict
// them to the league's commissioner, so no admin client is needed here.

function parsePositions(formData: FormData) {
  const positions: Record<string, number> = {};
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("position_")) continue;
    const count = Number(value);
    if (Number.isFinite(count) && count > 0) {
      positions[key.slice("position_".length)] = count;
    }
  }
  return positions;
}

export async function updateLeagueSettings(
  leagueId: string,
  _prevState: SettingsState,
  formData: FormData
): Promise<SettingsState> {
  const name = String(formData.get("name") ?? "").trim();
  const scoringFormat = String(formData.get("scoring_format") ?? "");

  if (!name) {
    return { error: "League name is required." };
  }
  if (!["std", "half_ppr", "ppr"].includes(scoringFormat)) {
    return { error: "Invalid scoring format." };
  }

  const positions = parsePositions(formData);
  const rostersPerTeam = Object.values(positions).reduce((sum, n) => sum + n, 0);
  if (rostersPerTeam === 0) {
    return { error: "Roster construction must have at least one position." };
  }

  const supabase = await createClient();
  // `.select("id")` so a zero-row update is distinguishable from a real one.
  // leagues_update RLS restricts this to the commissioner; when it filters
  // the row out, PostgREST answers `{ error: null }` — exactly what a
  // successful write returns. See confirmLeagueSetup below for the same shape.
  const { data, error } = await supabase
    .from("leagues")
    .update({ name, scoring_format: scoringFormat, positions, rosters_per_team: rostersPerTeam })
    .eq("id", leagueId)
    .select("id");

  if (error) {
    return { error: "Failed to save league settings. Please try again." };
  }

  if (!data || data.length === 0) {
    return {
      error: "Couldn't save league settings — you may not have permission to edit this league.",
    };
  }
  revalidatePath(`/leagues/${leagueId}/setup`);
  return { error: null };
}

// Step one of setup advances on save. The redirect lives here rather than in a
// client effect: navigating from an effect meant firing router.push on a render
// pass, which grew Next's client router cache until it threw "Map maximum size
// exceeded" and never navigated. confirmLeagueSetup below has always redirected
// server-side; this matches it.
//
// updateLeagueSettings stays as it is, returning state rather than redirecting,
// so it remains usable anywhere the caller does not want a navigation.
export async function saveLeagueSettingsAndContinue(
  leagueId: string,
  prevState: SettingsState,
  formData: FormData
): Promise<SettingsState> {
  const state = await updateLeagueSettings(leagueId, prevState, formData);
  if (state.error) {
    return state;
  }
  redirect(`/leagues/${leagueId}/setup?step=draft`);
}

export async function updateDraftSettings(
  leagueId: string,
  _prevState: SettingsState,
  formData: FormData
): Promise<SettingsState> {
  const secondsPerPick = Number(formData.get("seconds_per_pick"));
  const timerEnabled = formData.get("timer_enabled") === "on";
  const allowPickTrading = formData.get("allow_pick_trading") === "on";
  const draftStartTimeRaw = String(formData.get("draft_start_time") ?? "");
  const draftFormat = formData.get("draft_format");

  if (!Number.isFinite(secondsPerPick) || secondsPerPick < 10) {
    return { error: "Seconds per pick must be at least 10." };
  }
  // Checked here, before either write, rather than left to the database:
  // leagues.draft_format is a bare `text` with no CHECK behind it (matching
  // scoring_format and draft_status), so an unrecognized value would be
  // accepted and only surface at draft load, when draftSlotForPick throws on
  // a board it cannot lay out.
  if (!isDraftOrderType(draftFormat)) {
    return { error: "Invalid draft order." };
  }

  const supabase = await createClient();

  const { data: draftSettingsRows, error: draftSettingsError } = await supabase
    .from("draft_settings")
    .update({
      seconds_per_pick: secondsPerPick,
      timer_enabled: timerEnabled,
      allow_pick_trading: allowPickTrading,
    })
    .eq("league_id", leagueId)
    .select("league_id");

  if (draftSettingsError) {
    return { error: "Failed to save draft settings. Please try again." };
  }

  if (!draftSettingsRows || draftSettingsRows.length === 0) {
    return {
      error: "Couldn't save draft settings — you may not have permission to edit this league.",
    };
  }

  const { data: leagueRows, error: leagueError } = await supabase
    .from("leagues")
    .update({
      draft_start_time: draftStartTimeRaw ? new Date(draftStartTimeRaw).toISOString() : null,
      draft_format: draftFormat,
    })
    .eq("id", leagueId)
    .select("id");

  if (leagueError) {
    return { error: "Failed to save draft start time. Please try again." };
  }

  // Two tables, written sequentially, with no transaction spanning them — so
  // the first write can land while the second doesn't. Reporting a flat
  // failure would be as wrong as reporting success: the pick timer really did
  // change, and the commissioner needs to know which half to look at.
  if (!leagueRows || leagueRows.length === 0) {
    return {
      error:
        "Draft settings saved, but the draft order and start time didn't — you may not have permission to edit this league.",
    };
  }
  revalidatePath(`/leagues/${leagueId}/setup`);
  return { error: null };
}

// Both setup steps save through a redirect rather than by returning success
// state. Returning state leaves Next's dev renderer re-rendering the page in
// place, which spins on setImmediate until its async-hooks Map overflows
// ("RangeError: Map maximum size exceeded"): a 34s POST against a 607ms GET of
// the same page, with the two database writes measured at under a second.
// POST-redirect-GET sidesteps that, and gives the confirmation a home in the
// URL — somewhere no remount can wipe it.
export async function saveDraftSettings(
  leagueId: string,
  prevState: SettingsState,
  formData: FormData
): Promise<SettingsState> {
  const state = await updateDraftSettings(leagueId, prevState, formData);
  if (state.error) {
    return state;
  }
  redirect(`/leagues/${leagueId}/setup?step=draft&saved=1`);
}

// useActionState calls this with (state, formData); neither is used here,
// and TS allows a bound action to accept fewer params than the caller passes.
export async function confirmLeagueSetup(leagueId: string): Promise<SettingsState> {
  const supabase = await createClient();
  const { error, data } = await supabase
    .from("leagues")
    .update({ draft_status: "lobby" })
    .eq("id", leagueId)
    .eq("draft_status", "setup")
    .select("id");

  if (error || !data || data.length === 0) {
    return { error: "Failed to confirm league. Please try again." };
  }

  redirect(`/leagues/${leagueId}/lobby`);
}
