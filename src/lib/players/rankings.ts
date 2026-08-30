/**
 * The player rankings board — ordering, ranking and filtering.
 *
 * Pure, so the board can stay a server component that renders what this
 * returns, and so the ordering rules are testable without a populated
 * database. The Supabase read lives in src/lib/players/query.ts.
 *
 * "Rank" is not a stored column. It is the position in a `current_value`
 * ordering, computed here — a stored rank could disagree with the value it was
 * derived from, which is the same class of bug as the draft_board/
 * team_pick_assignments mirror the schema consolidation removed.
 */

/** A row as it comes back from the query layer, before ranking. */
export type PlayerRow = {
  player_id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  position: string | null;
  team: string | null;
  age: number | null;
  injury_status: string | null;
  /** Dynasty Dealer's current_value. Null for anyone the feed does not cover. */
  value: number | null;
  /** Redraft projection matching the league's scoring format. */
  projected_points: number | null;
  bye_week: number | null;
  /** Set when this player already occupies a draft_picks slot. */
  drafted_by_team_id: string | null;
  drafted_at_pick_no: number | null;
};

export type RankedPlayer = PlayerRow & {
  /**
   * 1-based position in the value ordering. Null for players the value feed
   * does not cover — deliberately not a number, so the UI has to render "—"
   * rather than silently showing them as rank 0 or last.
   */
  rank: number | null;
  isDrafted: boolean;
  displayName: string;
};

export type PositionFilter = string;

export type RankingFilters = {
  /** Matches name and team, case- and punctuation-insensitive. */
  search?: string;
  /** Empty means every position. */
  positions?: PositionFilter[];
  /** Hide players who already occupy a slot. */
  hideDrafted?: boolean;
};

/** "Ja'Marr Chase" and "jamarr chase" have to match, so strip to letters and digits. */
function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function nameOf(row: PlayerRow): string {
  if (row.full_name) return row.full_name;
  const parts = [row.first_name, row.last_name].filter(Boolean);
  // A player with no name at all is a broken row, not a blank one — showing
  // the id beats showing an empty cell nobody can act on.
  return parts.length > 0 ? parts.join(" ") : row.player_id;
}

/**
 * Orders by value, descending, and assigns a rank.
 *
 * Unranked players sort *after* every ranked one and keep a null rank. This is
 * the case that matters most for correctness: the value feed is top-1000 and
 * covers only QB/RB/WR/TE, so in an IDP or kicker league most of the pool has
 * no value at all. Treating a missing value as 0 would bury every defensive
 * player below every offensive one and present that as a ranking.
 */
export function rankPlayers(rows: PlayerRow[]): RankedPlayer[] {
  const ranked = [...rows].sort((a, b) => {
    const aHas = a.value !== null;
    const bHas = b.value !== null;
    if (aHas !== bHas) return aHas ? -1 : 1;
    if (aHas && bHas && a.value !== b.value) return b.value! - a.value!;
    // Stable, readable tiebreak so equal values don't shuffle between renders.
    return nameOf(a).localeCompare(nameOf(b));
  });

  let nextRank = 0;
  return ranked.map((row) => ({
    ...row,
    rank: row.value === null ? null : ++nextRank,
    isDrafted: row.drafted_by_team_id !== null,
    displayName: nameOf(row),
  }));
}

/** Positions a player can be filtered under — their listed one, at minimum. */
export function positionsOf(row: PlayerRow): string[] {
  return row.position ? [row.position.toUpperCase()] : [];
}

export function filterPlayers(
  players: RankedPlayer[],
  filters: RankingFilters
): RankedPlayer[] {
  const search = filters.search ? normalize(filters.search) : "";
  const positions = (filters.positions ?? []).map((p) => p.toUpperCase());

  return players.filter((player) => {
    if (filters.hideDrafted && player.isDrafted) return false;

    if (positions.length > 0) {
      const own = positionsOf(player);
      if (!own.some((p) => positions.includes(p))) return false;
    }

    if (search) {
      const haystack = normalize(`${player.displayName}${player.team ?? ""}`);
      if (!haystack.includes(search)) return false;
    }

    return true;
  });
}

/** Counts for the position pills, taken before filtering so they don't move as you type. */
export function positionCounts(players: RankedPlayer[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const player of players) {
    for (const position of positionsOf(player)) {
      counts[position] = (counts[position] ?? 0) + 1;
    }
  }
  return counts;
}

/**
 * Sleeper's public headshot CDN — docs/SLEEPER.md#player-photos. Built from the
 * id at render time; nothing about a photo is ever stored.
 */
export function headshotUrl(playerId: string): string {
  return `https://sleepercdn.com/content/nfl/players/thumb/${playerId}.jpg`;
}
