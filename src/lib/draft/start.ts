"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  DEFAULT_DRAFT_ORDER_TYPE,
  generateDraftOrder,
  isDraftOrderType,
  type DraftOrderType,
} from "@/lib/draft/order";
import type { DraftStartState } from "@/lib/draft/state";

/**
 * Draft load — turns a lobby into a draftable board.
 *
 * Import creates leagues, drafts and teams; the slots themselves (draft_picks)
 * and the empty rosters are created here, once, when the commissioner starts.
 * The drafts row already exists by this point, so this action updates it rather
 * than creating it.
 *
 * Reads go through the authenticated client so RLS still scopes them to a
 * league the caller belongs to. The writes split across two clients on purpose:
 *
 *   * The lobby → drafting transition is an authenticated update, because
 *     drafts_update RLS restricting it to the commissioner is doing real work
 *     — it is the authorization check with teeth, and the guarded update is the
 *     mutex.
 *   * Everything else goes through the service role. draft_picks and rosters
 *     carry select-only policies by design, and the clock columns on drafts are
 *     excluded from the commissioner's column grant, so an authenticated write
 *     to any of them matches zero rows and still reports success. See
 *     docs/SECURITY.md and the grant in the drafts consolidation migration.
 *
 * Player validation (docs/DRAFT_ENGINE.md#draft-load-validation) is not here
 * yet — the players table exists but nothing syncs it. Board generation does
 * not depend on it.
 */

/** One draft_picks row, built ahead of the write. */
type DraftPickRow = {
  draft_id: string;
  league_id: string;
  pick_no: number;
  round: number;
  draft_slot: number;
  team_id: string;
  original_team_id: string;
  status: string;
};

export async function startDraft(leagueId: string): Promise<DraftStartState> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in to start the draft." };
  }

  const { data: league } = await supabase
    .from("leagues")
    .select("id, commissioner_id, league_size")
    .eq("id", leagueId)
    .is("deleted_at", null)
    .single();

  if (!league) {
    return { error: "Couldn't find that league." };
  }
  if (league.commissioner_id !== user.id) {
    return { error: "Only the commissioner can start the draft." };
  }

  const { data: draft } = await supabase
    .from("drafts")
    .select("id, status, type, rounds, pick_timer")
    .eq("league_id", leagueId)
    .single();

  if (!draft) {
    return { error: "Couldn't find this league's draft." };
  }
  if (draft.status !== "lobby") {
    return { error: `This league is in the ${draft.status} phase and can't be started.` };
  }

  const { data: teams } = await supabase
    .from("teams")
    .select("id, draft_position")
    .eq("league_id", leagueId)
    .order("draft_position", { ascending: true });

  const allTeams = teams ?? [];
  if (allTeams.length !== league.league_size) {
    return {
      error: `This league has ${allTeams.length} of ${league.league_size} teams. Every seat must be filled to draft.`,
    };
  }

  // Every seat must be held exactly once. A duplicate or a gap still produces
  // a board — one team holding another's picks, and a seat with none — so
  // this is checked rather than assumed from the row count above.
  const seats = new Map<number, string>();
  for (const team of allTeams) {
    seats.set(team.draft_position, team.id);
  }
  const seatsAreComplete =
    seats.size === league.league_size &&
    Array.from({ length: league.league_size }, (_, index) => index + 1).every((seat) =>
      seats.has(seat)
    );
  if (!seatsAreComplete) {
    return {
      error: `Team draft positions must be exactly 1 to ${league.league_size}, with no duplicates.`,
    };
  }

  // drafts.type is constrained to ('snake', 'linear') by the schema, but the
  // constraint is a value set rather than this module's registry — a type
  // retired from DRAFT_ORDER_TYPES would still satisfy the database. Fall back
  // rather than throw: a draft that starts as a snake is recoverable, one that
  // refuses to start on the commissioner's big night is not.
  const orderType: DraftOrderType = isDraftOrderType(draft.type)
    ? draft.type
    : DEFAULT_DRAFT_ORDER_TYPE;

  const board = generateDraftOrder(league.league_size, draft.rounds, orderType);

  // Claim the transition before writing anything. This guarded update is the
  // mutex: two commissioners clicking at once both reach here, and only the one
  // whose update still sees 'lobby' matches a row.
  //
  // Only `status` is set here. The clock columns below are deliberately outside
  // the commissioner's column grant, so they cannot be written on this client
  // at all — they go through the service role with the rest of the board.
  const { data: claimed } = await supabase
    .from("drafts")
    .update({ status: "drafting" })
    .eq("id", draft.id)
    .eq("status", "lobby")
    .select("id");

  if (!claimed || claimed.length === 0) {
    return { error: "The draft has already been started." };
  }

  /** Puts the league back in the lobby so a failed load can be retried. */
  async function releaseClaim() {
    await supabase.from("drafts").update({ status: "lobby" }).eq("id", draft!.id);
  }

  const admin = createAdminClient();
  const firstSlot = board[0];

  const { error: clockError } = await admin
    .from("drafts")
    .update({
      current_pick_no: firstSlot.pickNumber,
      current_round: firstSlot.round,
      current_team_id: seats.get(firstSlot.draftPosition),
      timer_seconds: draft.pick_timer,
      // pick_timer = 0 is Sleeper's "unlimited", and it seeds the live toggle:
      // the draft opens with the clock off rather than counting down from zero.
      timer_active: draft.pick_timer > 0,
      timer_paused: false,
      timer_expired: false,
      started_at: new Date().toISOString(),
    })
    .eq("id", draft.id);

  if (clockError) {
    await releaseClaim();
    return { error: "Couldn't start the draft clock. Please try again." };
  }

  // One row per slot, replacing the old draft_board + team_pick_assignments
  // pair. team_id and original_team_id start equal; a trade moves the former
  // and leaves the latter, which is what makes "traded" derivable rather than
  // a status somebody has to remember to write.
  const pickRows: DraftPickRow[] = board.map((slot) => ({
    draft_id: draft.id,
    league_id: leagueId,
    pick_no: slot.pickNumber,
    round: slot.round,
    draft_slot: slot.draftPosition,
    team_id: seats.get(slot.draftPosition)!,
    original_team_id: seats.get(slot.draftPosition)!,
    status: "pending",
  }));

  const { error: picksError } = await admin.from("draft_picks").insert(pickRows);
  if (picksError) {
    await releaseClaim();
    return { error: "Couldn't build the draft board. Please try again." };
  }

  // Seeded empty so pick submission can update a row that already exists
  // rather than upserting on every pick.
  const { error: rosterError } = await admin.from("rosters").insert(
    allTeams.map((team) => ({
      team_id: team.id,
      league_id: leagueId,
      players: [],
      bench_count: 0,
      total_players: 0,
    }))
  );
  if (rosterError) {
    await releaseClaim();
    return { error: "Couldn't open the team rosters. Please try again." };
  }

  revalidatePath(`/leagues/${leagueId}/lobby`);
  redirect(`/leagues/${leagueId}/draft`);
}
