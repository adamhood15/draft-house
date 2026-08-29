import type {
  SleeperDraft,
  SleeperLeague,
  SleeperRoster,
  SleeperUser,
} from "@/lib/sleeper/types";
import { DEFAULT_DRAFT_ORDER_TYPE } from "@/lib/draft/order";

/** docs/SLEEPER.md#data-mapping — Sleeper's flat roster_positions array to a position-count map. */
export function buildPositions(rosterPositions: string[] | null | undefined) {
  const positions: Record<string, number> = {};
  for (const pos of rosterPositions ?? []) {
    positions[pos] = (positions[pos] ?? 0) + 1;
  }
  return positions;
}

/**
 * Sleeper has no single "scoring_format" field — it's derived from
 * scoring_settings.rec (points per reception), the standard PPR signal.
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
    draft_format: DEFAULT_DRAFT_ORDER_TYPE,
    rosters_per_team: rostersPerTeam,
    positions,
    league_settings: league.settings ?? {},
    draft_status: "setup" as const,
  };
}

export function transformDraftSettings(
  leagueId: string,
  commissionerId: string,
  drafts: SleeperDraft[]
) {
  const secondsPerPick = drafts[0]?.settings?.seconds_per_pick ?? 60;

  return {
    league_id: leagueId,
    commissioner_id: commissionerId,
    seconds_per_pick: secondsPerPick,
    timer_enabled: true,
    allow_pick_trading: true,
    auto_draft_enabled: false,
    auto_draft_type: "ffc_adp" as const,
  };
}

/** docs/SLEEPER.md#teams — team_name falls back to the owner's display name, then a positional placeholder. */
export function transformTeams(
  leagueId: string,
  rosters: SleeperRoster[],
  users: SleeperUser[]
) {
  return rosters.map((roster) => {
    const owner = users.find((u) => u.user_id === roster.owner_id);
    const teamName =
      roster.metadata?.team_name || owner?.display_name || `Team ${roster.roster_id}`;

    return {
      league_id: leagueId,
      sleeper_user_id: roster.owner_id,
      sleeper_team_name: teamName,
      draft_house_team_name: teamName,
      team_image_url: owner?.avatar ? `https://sleepercdn.com/avatars/${owner.avatar}` : null,
      draft_position: roster.roster_id,
      is_auto_draft: !roster.owner_id,
      family_league_wins: 0,
    };
  });
}
