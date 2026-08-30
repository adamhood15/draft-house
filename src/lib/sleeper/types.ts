export type SleeperLeague = {
  league_id: string;
  /** The league's current draft id, used to fetch the draft object directly. */
  draft_id: string | null;
  name: string;
  season: string;
  status: string;
  /**
   * Kept verbatim as the `league_settings` backup copy in Draft House, so its
   * values are whatever Sleeper sent — not necessarily numbers.
   */
  settings?: Record<string, unknown> | null;
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
  /** Avatar id, expanded to https://sleepercdn.com/avatars/<id>. */
  avatar: string | null;
  /**
   * Where Sleeper actually keeps the manager's team name and uploaded team
   * avatar — on the league USER, not the roster. `metadata.avatar` is a full
   * URL, unlike the id in `avatar` above.
   */
  metadata?: { team_name?: string; avatar?: string } | null;
};

export type SleeperDraft = {
  draft_id: string;
  /** "snake" | "linear" | "auction". Maps to drafts.type. */
  type: string;
  /** "pre_draft" | "drafting" | "paused" | "complete". */
  status: string;
  sport: string;
  season: string;
  season_type: string;
  /** Scheduled kickoff, epoch milliseconds. */
  start_time: number | null;
  /**
   * The settings Draft House enforces, promoted out of Sleeper's settings
   * object into typed values — they become real columns on `drafts`.
   *
   * `pick_timer` is the real field name. There is no `seconds_per_pick` on
   * Sleeper; reading one meant every imported league silently got the 60s
   * default no matter what the commissioner had configured.
   */
  settings: {
    rounds?: number;
    /** Seconds per pick. 0 is Sleeper's "unlimited", not a missing value. */
    pick_timer?: number;
  } | null;
  /**
   * Sleeper's settings and metadata objects, verbatim, for the matching jsonb
   * columns on `drafts`. Provenance only — application logic reads the promoted
   * values above, never these. See the migration header.
   */
  raw_settings: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  /** user_id -> draft slot. Null until the commissioner sets the order in Sleeper. */
  draft_order?: Record<string, number> | null;
  /** draft slot -> Sleeper roster_id. Absent from GET /league/<id>/drafts. */
  slot_to_roster_id?: Record<string, number> | null;
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
