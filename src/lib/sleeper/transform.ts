import type {
  SleeperDraft,
  SleeperLeague,
  SleeperRoster,
  SleeperUser,
} from "@/lib/sleeper/types";
import { DEFAULT_DRAFT_ORDER_TYPE, isDraftOrderType } from "@/lib/draft/order";
import { assignDraftPositions, type DraftSeatSources } from "@/lib/sleeper/draft-order";

/** docs/SLEEPER.md#data-mapping — Sleeper's flat roster_positions array to a position-count map. */
export function buildPositions(rosterPositions: string[] | null | undefined) {
  const positions: Record<string, number> = {};
  for (const pos of rosterPositions ?? []) {
    positions[pos] = (positions[pos] ?? 0) + 1;
  }
  return positions;
}

/**
 * GET /league/<league_id> returns `scoring_settings`: a ~130-key map of per-stat
 * point values (pass_td, rec_yd, rec, bonus_rec_te, ...). Nothing on the league
 * names the format, so collapse the map to a label the way Sleeper's own UI does
 * — on `rec`, points per reception (0 / 0.5 / 1).
 *
 * The draft object carries a `metadata.scoring_type`, but it's a compound
 * league-shape label ("idp_1qb", "2qb", "dynasty_ppr"), not a scoring format,
 * and is wrong often enough that it can't be trusted here.
 *
 * Values match docs/SLEEPER.md#player-rankings-for-auto-draft's std/ppr/half_ppr.
 */
export function deriveScoringFormat(
  scoringSettings: Record<string, number> | null | undefined
): "ppr" | "half_ppr" | "std" {
  const rec = scoringSettings?.rec ?? 0;
  if (rec >= 1) return "ppr";
  if (rec > 0) return "half_ppr";
  return "std";
}

export function transformLeague(
  league: SleeperLeague,
  rosterCount: number,
  commissionerId: string
) {
  const positions = buildPositions(league.roster_positions);
  const rostersPerTeam = league.roster_positions?.length ?? 15;

  return {
    commissioner_id: commissionerId,
    sleeper_league_id: league.league_id,
    name: league.name,
    season: Number(league.season),
    league_size: rosterCount,
    scoring_format: deriveScoringFormat(league.scoring_settings),
    rosters_per_team: rostersPerTeam,
    positions,
    league_settings: league.settings ?? {},
  };
}

/** Sleeper's draft type, narrowed to an order Draft House can actually lay out. */
function draftType(type: string) {
  // Auction is the realistic case here, and there is no board shape for it —
  // seeding a snake gives the commissioner something to run and something to
  // change, where seeding the raw value would fail the CHECK constraint and
  // take the whole import down with it.
  return isDraftOrderType(type) ? type : DEFAULT_DRAFT_ORDER_TYPE;
}

/**
 * One `drafts` row — the parent record, shaped after Sleeper's draft object.
 *
 * Promoted columns and verbatim jsonb both come from here, and the rule is the
 * one stated in the migration: `rounds` and `pick_timer` are authoritative,
 * `settings`/`metadata` are provenance nothing reads back.
 *
 * `rounds` falls back to the league's roster construction rather than a
 * constant. A draft with no `settings.rounds` is a real pre-draft state, and
 * every seat picking once per roster slot is the answer Sleeper itself would
 * arrive at.
 */
export function transformDraft(
  leagueId: string,
  league: SleeperLeague,
  draft: SleeperDraft | null
) {
  const rosterSlots = league.roster_positions?.length ?? 15;

  return {
    league_id: leagueId,
    sleeper_draft_id: draft?.draft_id ?? null,
    type: draftType(draft?.type ?? ""),
    // Sleeper's pre_draft covers both of Draft House's pre-draft stages; a
    // freshly imported league always starts in setup, where the commissioner
    // confirms the settings before anyone can join the lobby.
    status: "setup" as const,
    sport: draft?.sport || "nfl",
    season: Number(draft?.season) || Number(league.season),
    season_type: draft?.season_type || "regular",
    start_time: draft?.start_time ? new Date(draft.start_time).toISOString() : null,
    settings: draft?.raw_settings ?? {},
    metadata: draft?.metadata ?? {},
    draft_order: draft?.draft_order ?? null,
    slot_to_roster_id: draft?.slot_to_roster_id ?? null,
    rounds: draft?.settings?.rounds ?? rosterSlots,
    // 0 is "unlimited" and must survive as 0 — `??` rather than `||`, which
    // would read it as absent and restore the 60s default.
    pick_timer: draft?.settings?.pick_timer ?? 60,
    allow_pick_trading: true,
    auto_draft_enabled: false,
    auto_draft_type: "ffc_adp" as const,
  };
}

/**
 * The name a manager gave their team, as Sleeper stores it.
 *
 * It lives on the league USER (`GET /league/<id>/users` → `metadata.team_name`),
 * not on the roster: `GET /league/<id>/rosters` returns notification
 * preferences under `metadata` and no name at all. Reading it from the roster
 * meant the fallback chain quietly succeeded at step two and every team
 * imported under a display name instead — silent, because a display name is
 * always present.
 *
 * roster.metadata.team_name is still consulted after it, since older Sleeper
 * leagues are reported to carry one there and preferring the user's copy costs
 * nothing.
 */
function sleeperTeamName(roster: SleeperRoster, owner: SleeperUser | undefined) {
  return (
    owner?.metadata?.team_name ||
    roster.metadata?.team_name ||
    owner?.display_name ||
    `Team ${roster.roster_id}`
  );
}

/**
 * The team's image as Sleeper has it. A manager who uploaded a team avatar has
 * a full URL at `metadata.avatar`; everyone else falls back to their account
 * avatar id, which is expanded against the CDN.
 *
 * This is `teams.team_image_url`, the Sleeper-sourced value. It is never the
 * last word: `teams.custom_image_url` holds the in-app override and wins at
 * render time, so re-importing cannot overwrite a picture someone chose here.
 */
function sleeperTeamImageUrl(owner: SleeperUser | undefined) {
  if (owner?.metadata?.avatar) return owner.metadata.avatar;
  return owner?.avatar ? `https://sleepercdn.com/avatars/${owner.avatar}` : null;
}

/** docs/SLEEPER.md#teams — team_name falls back to the owner's display name, then a positional placeholder. */
export function transformTeams(
  leagueId: string,
  rosters: SleeperRoster[],
  users: SleeperUser[],
  seats: DraftSeatSources
) {
  // Seats come from Sleeper's own mapping, never from roster_id — see
  // src/lib/sleeper/draft-order.ts. slot_to_roster_id wins when present, which
  // is only on GET /draft/<draft_id>; draft_order is the fallback.
  const draftPositions = assignDraftPositions(rosters, seats);

  return rosters.map((roster) => {
    const owner = users.find((u) => u.user_id === roster.owner_id);
    const teamName = sleeperTeamName(roster, owner);

    return {
      league_id: leagueId,
      sleeper_user_id: roster.owner_id,
      // What drafts.slot_to_roster_id points at. Without it that map is a
      // stored blob nothing can resolve back to a team.
      sleeper_roster_id: roster.roster_id,
      // Two columns, deliberately: sleeper_team_name is what Sleeper says and
      // an import may refresh it, draft_house_team_name is the editable copy.
      // They start equal so a league that never renames anything looks right.
      sleeper_team_name: teamName,
      draft_house_team_name: teamName,
      // custom_image_url is left unset — that column is the in-app override,
      // and only a person choosing a picture should ever write it.
      team_image_url: sleeperTeamImageUrl(owner),
      draft_position: draftPositions.get(roster.roster_id)!,
      is_auto_draft: !roster.owner_id,
      family_league_wins: 0,
    };
  });
}
