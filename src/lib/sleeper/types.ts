export type SleeperLeague = {
  league_id: string;
  name: string;
  season: string;
  status: string;
  settings?: Record<string, number> | null;
  scoring_settings?: Record<string, number> | null;
  roster_positions?: string[] | null;
};

export type SleeperRoster = {
  roster_id: number;
  owner_id: string | null;
  metadata?: { team_name?: string } | null;
};

export type SleeperUser = {
  user_id: string;
  display_name: string;
  avatar: string | null;
};

export type SleeperDraft = {
  draft_id: string;
  type: string;
  settings?: { seconds_per_pick?: number } | null;
};

export type SleeperUserLookup = {
  user_id: string;
  username: string;
  display_name: string;
  avatar: string | null;
};

export type SleeperLeagueSummary = {
  league_id: string;
  name: string;
  season: string;
  total_rosters: number;
  status: string;
};

export type SleeperNflState = {
  season: string;
  season_type: string;
};
