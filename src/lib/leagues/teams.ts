import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type InviteLeague = {
  id: string;
  name: string;
  season: number;
  draft_status: string;
};

export type UnclaimedTeam = {
  id: string;
  draft_house_team_name: string;
  team_image_url: string | null;
};

/**
 * Reads for the invite page — the viewer isn't a league member yet (that's
 * the whole point), so leagues_select/teams_select RLS can't apply here any
 * more than it can for import (see docs/DATABASE.md#2-leagues). The invite
 * token itself is the authorization: knowing it is what grants the read.
 */
export async function getLeagueByInviteToken(inviteToken: string): Promise<InviteLeague | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("leagues")
    .select("id, name, season, draft_status")
    .eq("invite_token", inviteToken)
    .is("deleted_at", null)
    .maybeSingle();
  return data;
}

export async function getUnclaimedTeams(leagueId: string): Promise<UnclaimedTeam[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("teams")
    .select("id, draft_house_team_name, team_image_url")
    .eq("league_id", leagueId)
    .is("owner_id", null)
    .order("draft_position", { ascending: true });
  return data ?? [];
}

export async function getUserClaimedTeamId(
  leagueId: string,
  userId: string
): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("teams")
    .select("id")
    .eq("league_id", leagueId)
    .eq("owner_id", userId)
    .maybeSingle();

  // `.maybeSingle()` does not throw on two rows — postgrest-js synthesizes
  // PGRST116 with a null body client-side (dist/index.cjs, isMaybeSingle
  // branch) and only throws under `.throwOnError()`, which this codebase
  // never sets. So discarding `error` here would answer "owns no team" for a
  // user who owns two — indistinguishable from an honest unclaimed user, and
  // it routes them straight back into claiming a third.
  //
  // Duplicate ownership is the exact state the partial unique index on
  // teams (league_id, owner_id) exists to prevent, so reaching this is a
  // broken invariant, not a condition to paper over. Fail loudly rather than
  // fail open.
  if (error) {
    throw new Error(
      `Could not determine the claimed team for user ${userId} in league ${leagueId}: ${error.message}`
    );
  }

  return data?.id ?? null;
}
