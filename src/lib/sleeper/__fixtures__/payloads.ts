/**
 * Captured-shape fixtures for the Sleeper endpoints Draft House calls, matching
 * the response bodies documented in docs/SLEEPER.md#endpoints-used.
 *
 * A test must never reach the live Sleeper API (docs/TESTING.md#writing-tests),
 * so every Sleeper test builds its payload from here. Each factory returns a
 * fresh object, so a test can drop or mutate fields without leaking into the
 * next one.
 *
 * Typed as `Record<string, unknown>` on purpose: these stand in for untrusted
 * network payloads, and typing them as the domain types would let a fixture
 * that no longer matches Sleeper still typecheck.
 */

export function sleeperLeaguePayload(): Record<string, unknown> {
  return {
    league_id: "1234567890",
    name: "Hood Family Fantasy",
    season: "2025",
    status: "in_season",
    settings: { bench_slots: 6, reserve_slots: 0, taxi_slots: 0 },
    scoring_settings: { rec: 1, pass_td: 4 },
    roster_positions: [
      "QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "DEF", "K", "BN", "BN", "BN",
    ],
    // Sleeper sends plenty Draft House does not read; validation must not choke on it.
    previous_league_id: "0987654321",
    total_rosters: 12,
  };
}

export function sleeperRostersPayload(): Record<string, unknown>[] {
  return [
    {
      roster_id: 1,
      owner_id: "user_123",
      metadata: { team_name: "The Hoodlums" },
      players: ["2222", "3333"],
    },
    // An unowned team — docs/SLEEPER.md#emptyunowned-teams says this is normal.
    { roster_id: 2, owner_id: null, metadata: null, players: [] },
  ];
}

export function sleeperUsersPayload(): Record<string, unknown>[] {
  return [
    { user_id: "user_123", username: "adamhood", display_name: "Adam Hood", avatar: "abc123" },
    { user_id: "user_456", username: "someone", display_name: "Someone Else", avatar: null },
  ];
}

/**
 * Shaped after a real GET /draft/<draft_id> response, verified against league
 * 1357756813482684416. The timer field is `pick_timer` — there is no
 * `seconds_per_pick` on Sleeper, and this fixture used to invent one, which is
 * how the import came to read a field that never existed.
 */
export function sleeperDraftPayload(): Record<string, unknown> {
  return {
    draft_id: "draft_123",
    league_id: "1234567890",
    type: "snake",
    status: "pre_draft",
    sport: "nfl",
    season: "2026",
    season_type: "regular",
    start_time: 1788110110440,
    settings: { rounds: 16, teams: 12, pick_timer: 30, slots_qb: 1, slots_rb: 2 },
    metadata: { scoring_type: "ppr", name: "Draft", description: "" },
    draft_order: { user_123: 1, user_456: 2 },
    slot_to_roster_id: { "1": 7, "2": 3 },
  };
}

export function sleeperDraftsPayload(): Record<string, unknown>[] {
  return [sleeperDraftPayload()];
}

export function sleeperUserLookupPayload(): Record<string, unknown> {
  return {
    user_id: "user_123",
    username: "adamhood",
    display_name: "Adam Hood",
    avatar: "abc123",
  };
}

export function sleeperLeagueSummariesPayload(): Record<string, unknown>[] {
  return [
    {
      league_id: "1234567890",
      name: "Hood Family Fantasy",
      season: "2025",
      total_rosters: 12,
      status: "in_season",
    },
  ];
}

export function sleeperNflStatePayload(): Record<string, unknown> {
  return { season: "2025", season_type: "regular", week: 1 };
}

/** Drops one key, for the "field Sleeper stopped sending" cases. */
export function without(
  payload: Record<string, unknown>,
  key: string
): Record<string, unknown> {
  const copy = { ...payload };
  delete copy[key];
  return copy;
}
