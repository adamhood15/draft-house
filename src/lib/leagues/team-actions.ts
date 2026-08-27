"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ClaimState } from "@/lib/leagues/state";

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
  const { data: existingClaim } = await admin
    .from("teams")
    .select("id")
    .eq("league_id", leagueId)
    .eq("owner_id", user.id)
    .maybeSingle();

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

  if (error || !data || data.length === 0) {
    return { error: "That team was just claimed by someone else — pick another." };
  }

  redirect(`/leagues/${leagueId}/lobby`);
}
