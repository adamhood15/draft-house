import { describe, expect, it } from "vitest";
import { transformDraft, transformTeams } from "@/lib/sleeper/transform";

/**
 * transformTeams had no tests, which is how `draft_position: roster.roster_id`
 * survived: roster_id is Sleeper's team identifier, not its draft slot, so the
 * import produced a complete, plausible, wrong board every time — no error, no
 * failing check, nothing to notice until someone read the column headers.
 *
 * These pin the seat specifically. assignDraftPositions is unit-tested on its
 * own; what matters here is that transformTeams actually calls it and puts the
 * result on the right field.
 */

const ROSTERS = [
  { roster_id: 1, owner_id: "user-first", metadata: { team_name: "Alpha" } },
  { roster_id: 2, owner_id: "user-second", metadata: { team_name: "Bravo" } },
  { roster_id: 3, owner_id: "user-third", metadata: { team_name: "Charlie" } },
];

const USERS = [
  { user_id: "user-first", display_name: "First", avatar: null },
  { user_id: "user-second", display_name: "Second", avatar: "abc" },
  { user_id: "user-third", display_name: "Third", avatar: null },
];

function seatsByName(teams: ReturnType<typeof transformTeams>) {
  return Object.fromEntries(teams.map((team) => [team.draft_house_team_name, team.draft_position]));
}

describe("transformTeams draft position", () => {
  it("seats teams by Sleeper's draft_order, not by roster_id", () => {
    // Deliberately the reverse of roster_id order, so the two can't be confused.
    const teams = transformTeams("league-1", ROSTERS, USERS, {
      draftOrder: { "user-third": 1, "user-second": 2, "user-first": 3 },
    });

    expect(seatsByName(teams)).toEqual({ Charlie: 1, Bravo: 2, Alpha: 3 });
  });

  it("still returns one row per roster, with seats 1..N", () => {
    const teams = transformTeams("league-1", ROSTERS, USERS, {
      draftOrder: { "user-third": 1, "user-second": 2, "user-first": 3 },
    });
    expect(teams).toHaveLength(ROSTERS.length);
    expect(teams.map((team) => team.draft_position).sort()).toEqual([1, 2, 3]);
  });

  it("falls back to roster_id order when Sleeper has no draft order yet", () => {
    // draft_order is null until the commissioner sets it — an ordinary
    // pre-draft state, and the commissioner can reorder in Draft House anyway.
    expect(seatsByName(transformTeams("league-1", ROSTERS, USERS, { draftOrder: null }))).toEqual({
      Alpha: 1,
      Bravo: 2,
      Charlie: 3,
    });
    expect(seatsByName(transformTeams("league-1", ROSTERS, USERS, { draftOrder: undefined }))).toEqual({
      Alpha: 1,
      Bravo: 2,
      Charlie: 3,
    });
  });

  it("never leaves a team without a seat", () => {
    // draft_position is `integer not null`; an undefined here reaches Postgres
    // as a null and fails the whole import.
    const withOrphan = [...ROSTERS, { roster_id: 9, owner_id: null, metadata: null }];
    const teams = transformTeams("league-1", withOrphan, USERS, { draftOrder: { "user-first": 1 } });

    expect(teams.every((team) => Number.isInteger(team.draft_position))).toBe(true);
    expect(teams.map((team) => team.draft_position).sort()).toEqual([1, 2, 3, 4]);
  });

  it("keeps the rest of the mapping intact", () => {
    const teams = transformTeams("league-1", ROSTERS, USERS, { draftOrder: { "user-first": 1 } });
    const alpha = teams.find((team) => team.draft_house_team_name === "Alpha");

    expect(alpha).toMatchObject({
      league_id: "league-1",
      sleeper_user_id: "user-first",
      sleeper_team_name: "Alpha",
      is_auto_draft: false,
      family_league_wins: 0,
    });
  });

  it("marks an unowned roster as auto-draft", () => {
    const teams = transformTeams(
      "league-1",
      [{ roster_id: 1, owner_id: null, metadata: null }],
      USERS,
      { draftOrder: null }
    );
    expect(teams[0]).toMatchObject({ is_auto_draft: true, draft_position: 1 });
  });
});

/**
 * Team names and avatars live on the league USER, not the roster.
 * GET /league/<id>/rosters returns notification preferences under `metadata`
 * and no name at all, so reading the name from the roster meant the fallback
 * chain succeeded at step two and every team imported under a display name —
 * silently, because a display name is always there.
 *
 * Verified against league 1357756813482684416, where 4 of 8 users carry a
 * team_name and 0 of 8 rosters do.
 */
describe("transformTeams identity", () => {
  const roster = (owner_id: string | null, metadata: { team_name?: string } | null = null) => [
    { roster_id: 1, owner_id, metadata },
  ];

  it("takes the team name from the league user's metadata", () => {
    const teams = transformTeams(
      "league-1",
      roster("user-a"),
      [
        {
          user_id: "user-a",
          display_name: "khood2",
          avatar: null,
          metadata: { team_name: "Juwanna Wanga" },
        },
      ],
      { draftOrder: null }
    );
    expect(teams[0].sleeper_team_name).toBe("Juwanna Wanga");
    expect(teams[0].draft_house_team_name).toBe("Juwanna Wanga");
  });

  it("prefers the user's team name over the roster's", () => {
    const teams = transformTeams(
      "league-1",
      roster("user-a", { team_name: "From Roster" }),
      [
        {
          user_id: "user-a",
          display_name: "khood2",
          avatar: null,
          metadata: { team_name: "From User" },
        },
      ],
      { draftOrder: null }
    );
    expect(teams[0].sleeper_team_name).toBe("From User");
  });

  it("falls back through roster metadata, then display name, then a placeholder", () => {
    const users = [{ user_id: "user-a", display_name: "khood2", avatar: null, metadata: null }];

    expect(
      transformTeams("league-1", roster("user-a", { team_name: "Legacy" }), users, { draftOrder: null })[0]
        .sleeper_team_name
    ).toBe("Legacy");

    expect(transformTeams("league-1", roster("user-a"), users, { draftOrder: null })[0].sleeper_team_name).toBe(
      "khood2"
    );

    expect(transformTeams("league-1", roster(null), [], { draftOrder: null })[0].sleeper_team_name).toBe("Team 1");
  });

  it("uses the uploaded team avatar URL when the manager has one", () => {
    // metadata.avatar is a full URL; the top-level `avatar` is only an id.
    const teams = transformTeams(
      "league-1",
      roster("user-a"),
      [
        {
          user_id: "user-a",
          display_name: "khood2",
          avatar: "abc123",
          metadata: { avatar: "https://sleepercdn.com/uploads/61d65e9a.jpg" },
        },
      ],
      { draftOrder: null }
    );
    expect(teams[0].team_image_url).toBe("https://sleepercdn.com/uploads/61d65e9a.jpg");
  });

  it("expands the account avatar id when there is no uploaded team avatar", () => {
    const teams = transformTeams(
      "league-1",
      roster("user-a"),
      [{ user_id: "user-a", display_name: "khood2", avatar: "abc123", metadata: null }],
      { draftOrder: null }
    );
    expect(teams[0].team_image_url).toBe("https://sleepercdn.com/avatars/abc123");
  });

  it("leaves the image null when the manager has neither", () => {
    const teams = transformTeams(
      "league-1",
      roster("user-a"),
      [{ user_id: "user-a", display_name: "khood2", avatar: null, metadata: null }],
      { draftOrder: null }
    );
    expect(teams[0].team_image_url).toBeNull();
  });

  it("never writes custom_image_url — that column is the in-app override", () => {
    const teams = transformTeams(
      "league-1",
      roster("user-a"),
      [
        {
          user_id: "user-a",
          display_name: "khood2",
          avatar: "abc",
          metadata: { avatar: "https://sleepercdn.com/uploads/x.jpg" },
        },
      ],
      { draftOrder: null }
    );
    expect(teams[0]).not.toHaveProperty("custom_image_url");
  });
});

/**
 * transformDraft replaced transformDraftSettings, which read
 * `settings.seconds_per_pick` — a field Sleeper has never sent. Every imported
 * league silently took the 60s default no matter what its commissioner had
 * configured, and nothing failed, because 60 is a perfectly plausible answer.
 *
 * Verified against league 1357756813482684416, whose draft runs a 30s clock.
 */
describe("transformDraft", () => {
  const league = {
    league_id: "1234567890",
    draft_id: "draft_123",
    name: "Hood Family Fantasy",
    season: "2026",
    status: "pre_draft",
    roster_positions: ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "BN", "BN"],
  };

  const draft = {
    draft_id: "draft_123",
    type: "snake",
    status: "pre_draft",
    sport: "nfl",
    season: "2026",
    season_type: "regular",
    start_time: 1788110110440,
    settings: { rounds: 16, pick_timer: 30 },
    raw_settings: { rounds: 16, pick_timer: 30, slots_qb: 1, teams: 12 },
    metadata: { scoring_type: "ppr", name: "Draft" },
    draft_order: { "user-a": 1 },
    slot_to_roster_id: { "1": 7 },
  };

  it("reads the pick timer from pick_timer, the field that exists", () => {
    expect(transformDraft("league-1", league, draft).pick_timer).toBe(30);
  });

  it("keeps pick_timer 0 rather than falling back to 60", () => {
    // 0 is Sleeper's "unlimited". `??` and `||` differ here, and `||` would
    // restore the default on exactly the leagues that turned the clock off.
    const noTimer = { ...draft, settings: { rounds: 16, pick_timer: 0 } };
    expect(transformDraft("league-1", league, noTimer).pick_timer).toBe(0);
  });

  it("takes rounds from the draft's own settings", () => {
    expect(transformDraft("league-1", league, draft).rounds).toBe(16);
  });

  it("falls back to the league's roster slots when the draft has no rounds", () => {
    // A pre-draft league with no rounds set is ordinary, and every seat
    // picking once per roster slot is the answer Sleeper itself arrives at.
    const noRounds = { ...draft, settings: { pick_timer: 30 } };
    expect(transformDraft("league-1", league, noRounds).rounds).toBe(9);
  });

  it("stores Sleeper's settings and metadata whole, beside the promoted columns", () => {
    const row = transformDraft("league-1", league, draft);

    expect(row.settings).toMatchObject({ slots_qb: 1, teams: 12 });
    expect(row.metadata).toMatchObject({ scoring_type: "ppr" });
    // The promoted values are the authoritative pair; the jsonb is provenance.
    expect(row.rounds).toBe(16);
    expect(row.pick_timer).toBe(30);
  });

  it("carries both seat mappings through to the draft row", () => {
    const row = transformDraft("league-1", league, draft);
    expect(row.slot_to_roster_id).toEqual({ "1": 7 });
    expect(row.draft_order).toEqual({ "user-a": 1 });
  });

  it("converts Sleeper's epoch-millisecond start time to a timestamp", () => {
    expect(transformDraft("league-1", league, draft).start_time).toBe(
      new Date(1788110110440).toISOString()
    );
  });

  it("falls back to a snake for an order Draft House cannot lay out", () => {
    // Auction is the realistic case. Seeding the raw value would fail
    // drafts_type_check and take the whole import down; a snake gives the
    // commissioner something to run and something to change.
    expect(transformDraft("league-1", league, { ...draft, type: "auction" }).type).toBe("snake");
  });

  it("imports into setup, so the commissioner confirms before the lobby opens", () => {
    expect(transformDraft("league-1", league, draft).status).toBe("setup");
  });

  it("produces a usable draft for a league Sleeper has not drafted yet", () => {
    // league.draft_id is null, so import fetches no draft at all.
    const row = transformDraft("league-1", league, null);

    expect(row).toMatchObject({
      type: "snake",
      status: "setup",
      rounds: 9,
      pick_timer: 60,
      season: 2026,
      sleeper_draft_id: null,
    });
    expect(row.start_time).toBeNull();
  });

  it("falls back to the league's season when the draft omits its own", () => {
    const row = transformDraft("league-1", league, { ...draft, season: "" });
    expect(row.season).toBe(2026);
  });
});

describe("transformTeams seat sources", () => {
  const ROSTER_ROWS = [
    { roster_id: 7, owner_id: "user-a", metadata: null },
    { roster_id: 3, owner_id: "user-b", metadata: null },
  ];
  const USER_ROWS = [
    { user_id: "user-a", display_name: "A", avatar: null },
    { user_id: "user-b", display_name: "B", avatar: null },
  ];

  it("records the Sleeper roster_id that slot_to_roster_id points at", () => {
    // Without this column drafts.slot_to_roster_id is a stored blob nothing
    // can resolve back to a team — teams.sleeper_user_id cannot stand in,
    // because an unowned roster has no user.
    const teams = transformTeams("league-1", ROSTER_ROWS, USER_ROWS, { draftOrder: null });
    expect(teams.map((team) => team.sleeper_roster_id)).toEqual([7, 3]);
  });

  it("prefers slot_to_roster_id over draft_order", () => {
    // Only GET /draft/<id> returns slot_to_roster_id, and it is the
    // authoritative mapping — draft_order is the fallback for the list
    // endpoint. Disagreeing sources must not silently average out.
    const teams = transformTeams("league-1", ROSTER_ROWS, USER_ROWS, {
      slotToRosterId: { "1": 3, "2": 7 },
      draftOrder: { "user-a": 1, "user-b": 2 },
    });

    const seatByRoster = Object.fromEntries(
      teams.map((team) => [team.sleeper_roster_id, team.draft_position])
    );
    expect(seatByRoster).toEqual({ 3: 1, 7: 2 });
  });
});
