import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  fetchNflState,
  fetchSleeperDrafts,
  fetchSleeperLeague,
  fetchSleeperLeaguesForUser,
  fetchSleeperRosters,
  fetchSleeperUserByUsername,
  fetchSleeperUsers,
  SleeperNotFoundError,
  SleeperUnavailableError,
} from "@/lib/sleeper/client";
import {
  transformDraftSettings,
  transformLeague,
  transformTeams,
} from "@/lib/sleeper/transform";
import type { SleeperLeagueSummary } from "@/lib/sleeper/types";

// Sleeper league IDs are numeric Discord-snowflake-style strings.
const SLEEPER_LEAGUE_ID_PATTERN = /^\d+$/;

export class LeagueImportError extends Error {
  status: number;
  /** Set when the error is "already imported" — lets the UI link straight to it. */
  existingLeagueId?: string;
  constructor(message: string, status: number, existingLeagueId?: string) {
    super(message);
    this.status = status;
    this.existingLeagueId = existingLeagueId;
  }
}

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new LeagueImportError("You must be signed in to import a league.", 401);
  }
  return user;
}

/**
 * Looks up a Sleeper account by username and returns the leagues it belongs
 * to for the current season, so the commissioner can pick one instead of
 * having to know a raw league ID.
 */
export async function lookupSleeperLeagues(
  usernameRaw: string
): Promise<{ leagues: SleeperLeagueSummary[] }> {
  const username = usernameRaw.trim();
  if (!username) {
    throw new LeagueImportError("Enter your Sleeper username.", 400);
  }

  await requireUser();

  try {
    const sleeperUser = await fetchSleeperUserByUsername(username);
    const state = await fetchNflState();
    const leagues = await fetchSleeperLeaguesForUser(sleeperUser.user_id, state.season);

    if (leagues.length === 0) {
      throw new LeagueImportError(
        `No ${state.season} Sleeper leagues found for "${username}".`,
        404
      );
    }

    return { leagues };
  } catch (error) {
    if (error instanceof LeagueImportError) throw error;
    if (error instanceof SleeperNotFoundError) {
      throw new LeagueImportError("Sleeper username not found.", 404);
    }
    if (error instanceof SleeperUnavailableError) {
      throw new LeagueImportError("Unable to reach Sleeper. Please try again.", 502);
    }
    throw error;
  }
}

/**
 * Shared by the Server Action (leagues/new form) and the POST /api/leagues/import
 * route handler (see ARCHITECTURE.md's Sleeper Integration section) so the
 * fetch/transform/write logic exists in exactly one place.
 *
 * leagues/draft_settings/teams have no client-facing insert policy (see
 * supabase/migrations/20260823000003_rls_policies.sql) — import is
 * necessarily a server-authoritative write via the admin client, gated by
 * verifying the caller's session here first.
 */
export async function importSleeperLeague(sleeperLeagueIdRaw: string): Promise<{ leagueId: string }> {
  const sleeperLeagueId = sleeperLeagueIdRaw.trim();

  if (!SLEEPER_LEAGUE_ID_PATTERN.test(sleeperLeagueId)) {
    throw new LeagueImportError(
      "Enter the numeric Sleeper league ID from your league's URL.",
      400
    );
  }

  const user = await requireUser();

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("leagues")
    .select("id")
    .eq("sleeper_league_id", sleeperLeagueId)
    .is("deleted_at", null)
    .maybeSingle();

  if (existing) {
    throw new LeagueImportError(
      "This league has already been imported to Draft House.",
      409,
      existing.id
    );
  }

  let league, rosters, users, drafts;
  try {
    [league, rosters, users, drafts] = await Promise.all([
      fetchSleeperLeague(sleeperLeagueId),
      fetchSleeperRosters(sleeperLeagueId),
      fetchSleeperUsers(sleeperLeagueId),
      fetchSleeperDrafts(sleeperLeagueId),
    ]);
  } catch (error) {
    if (error instanceof SleeperNotFoundError) {
      throw new LeagueImportError("League not found. Please check the league ID.", 404);
    }
    if (error instanceof SleeperUnavailableError) {
      throw new LeagueImportError("Unable to import league. Please try again.", 502);
    }
    throw error;
  }

  const leagueRow = transformLeague(league, rosters.length, user.id);

  const { data: insertedLeague, error: leagueError } = await admin
    .from("leagues")
    .insert(leagueRow)
    .select("id")
    .single();

  if (leagueError || !insertedLeague) {
    throw new LeagueImportError("Failed to import league. Please try again.", 500);
  }

  const leagueId = insertedLeague.id as string;

  const { error: settingsError } = await admin
    .from("draft_settings")
    .insert(transformDraftSettings(leagueId, user.id, drafts));

  const { error: teamsError } = settingsError
    ? { error: null }
    : await admin.from("teams").insert(transformTeams(leagueId, rosters, users));

  if (settingsError || teamsError) {
    // Cascades to draft_settings/teams via their `references leagues(id) on delete cascade` FKs.
    await admin.from("leagues").delete().eq("id", leagueId);
    throw new LeagueImportError("Failed to import league. Please try again.", 500);
  }

  return { leagueId };
}
