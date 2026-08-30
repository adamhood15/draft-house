import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { PlayerRow } from "@/lib/players/rankings";

/**
 * Reads the player pool for the rankings board.
 *
 * Everything here goes through the authenticated client. `players`,
 * `team_bye_weeks` and `player_values` are league-independent reference data
 * readable by any signed-in user; `draft_picks` is scoped by RLS to a league
 * the caller belongs to, which is what keeps one league's board from revealing
 * another's picks.
 */

/** How many ranked players the board loads. The value feed tops out at 1,000. */
const RANKED_LIMIT = 1000;

/** leagues.scoring_format → the Dynasty Dealer API's `scoring` parameter. */
export function scoringKeyFor(scoringFormat: string): "std" | "half" | "ppr" {
  if (scoringFormat === "ppr") return "ppr";
  if (scoringFormat === "half_ppr") return "half";
  return "std";
}

/**
 * A league is superflex when it can start more than one quarterback — either
 * an explicit SUPER_FLEX slot or a second QB slot. It changes which value row
 * applies, since a superflex QB is worth substantially more.
 */
export function isSuperflex(positions: Record<string, number> | null | undefined): boolean {
  if (!positions) return false;
  const slots = Object.entries(positions);
  const superFlex = slots.some(([slot]) => slot.toUpperCase().replace(/[^A-Z]/g, "") === "SUPERFLEX");
  const multipleQb = (positions.QB ?? 0) > 1;
  return superFlex || multipleQb;
}

/** The projection column matching the league's scoring. */
function projectionColumn(scoring: "std" | "half" | "ppr") {
  return `proj_pts_${scoring}` as const;
}

export type PlayerPoolOptions = {
  leagueId: string;
  season: number;
  scoringFormat: string;
  positions: Record<string, number> | null | undefined;
};

export async function getPlayerPool(options: PlayerPoolOptions): Promise<PlayerRow[]> {
  const supabase = await createClient();
  const scoring = scoringKeyFor(options.scoringFormat);
  const superflex = isSuperflex(options.positions);

  // Four independent reads rather than one join. PostgREST can only embed
  // across a declared foreign key, and player_values deliberately has none to
  // players (they sync independently — see the migration), so the join has to
  // happen here regardless. Doing all four in parallel costs one round trip.
  const [playersResult, valuesResult, byesResult, picksResult] = await Promise.all([
    supabase
      .from("players")
      .select(
        "player_id, full_name, first_name, last_name, position, team, age, injury_status"
      )
      .eq("active", true),
    supabase
      .from("player_values")
      .select(`sleeper_player_id, current_value, ${projectionColumn(scoring)}`)
      .eq("format", "redraft")
      .eq("scoring", scoring)
      .eq("superflex", superflex)
      .order("current_value", { ascending: false })
      .limit(RANKED_LIMIT),
    supabase.from("team_bye_weeks").select("team, bye_week").eq("season", options.season),
    supabase
      .from("draft_picks")
      .select("sleeper_player_id, team_id, pick_no")
      .eq("league_id", options.leagueId)
      .not("sleeper_player_id", "is", null),
  ]);

  const players = playersResult.data ?? [];
  if (players.length === 0) return [];

  const valueByPlayer = new Map(
    (valuesResult.data ?? []).map((row) => [
      row.sleeper_player_id as string,
      {
        value: row.current_value as number | null,
        projected: (row as Record<string, unknown>)[projectionColumn(scoring)] as number | null,
      },
    ])
  );
  const byeByTeam = new Map(
    (byesResult.data ?? []).map((row) => [row.team as string, row.bye_week as number])
  );
  const pickByPlayer = new Map(
    (picksResult.data ?? []).map((row) => [
      row.sleeper_player_id as string,
      { teamId: row.team_id as string, pickNo: row.pick_no as number },
    ])
  );

  return players.map((player) => {
    const value = valueByPlayer.get(player.player_id);
    const pick = pickByPlayer.get(player.player_id);

    return {
      player_id: player.player_id,
      full_name: player.full_name,
      first_name: player.first_name,
      last_name: player.last_name,
      position: player.position,
      team: player.team,
      age: player.age,
      injury_status: player.injury_status,
      value: value?.value ?? null,
      projected_points: value?.projected ?? null,
      // Free agents have no team and therefore no bye, which is correct
      // rather than missing — they are on no schedule.
      bye_week: player.team ? (byeByTeam.get(player.team) ?? null) : null,
      drafted_by_team_id: pick?.teamId ?? null,
      drafted_at_pick_no: pick?.pickNo ?? null,
    } satisfies PlayerRow;
  });
}
