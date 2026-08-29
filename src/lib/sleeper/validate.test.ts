import { describe, expect, it } from "vitest";
import { SleeperShapeError, SleeperUnavailableError } from "@/lib/sleeper/errors";
import {
  validateSleeperDrafts,
  validateSleeperLeague,
  validateSleeperLeagueSummaries,
  validateSleeperNflState,
  validateSleeperRosters,
  validateSleeperUserLookup,
  validateSleeperUsers,
} from "@/lib/sleeper/validate";
import {
  sleeperDraftsPayload,
  sleeperLeaguePayload,
  sleeperLeagueSummariesPayload,
  sleeperNflStatePayload,
  sleeperRostersPayload,
  sleeperUserLookupPayload,
  sleeperUsersPayload,
  without,
} from "@/lib/sleeper/__fixtures__/payloads";

/**
 * Sleeper is an unversioned public API with no contract, so its payloads are
 * untrusted input (docs/ENGINEERING.md#code-conventions). These cover the
 * boundary rule: a field Sleeper stops sending must fail here, naming Sleeper,
 * rather than travelling on as a null into a `not null` column.
 */

describe("SleeperShapeError", () => {
  it("is a SleeperUnavailableError, so existing catch blocks keep working", () => {
    // import.ts maps SleeperUnavailableError to a 502 with a retry message. A
    // shape failure has to land in that same branch, not escape as a raw 500.
    expect(new SleeperShapeError("x")).toBeInstanceOf(SleeperUnavailableError);
  });
});

describe("validateSleeperLeague", () => {
  it("returns the fields the import consumes", () => {
    const league = validateSleeperLeague(sleeperLeaguePayload(), "/league/1234567890");

    expect(league.league_id).toBe("1234567890");
    expect(league.name).toBe("Hood Family Fantasy");
    expect(league.season).toBe("2025");
    expect(league.roster_positions).toHaveLength(12);
    expect(league.scoring_settings).toEqual({ rec: 1, pass_td: 4 });
  });

  it("normalizes a numeric season to a string", () => {
    // docs/SLEEPER.md#1-get-league shows `"season": 2025` unquoted while
    // types.ts declares a string. Accept both rather than pick a side.
    const league = validateSleeperLeague(
      { ...sleeperLeaguePayload(), season: 2025 },
      "/league/1234567890"
    );

    expect(league.season).toBe("2025");
  });

  it("rejects a payload with no season instead of passing NaN to the schema", () => {
    // `Number(undefined)` is NaN, which fails `season integer not null` as a
    // raw Postgres error three layers below the actual cause.
    expect(() =>
      validateSleeperLeague(without(sleeperLeaguePayload(), "season"), "/league/1234567890")
    ).toThrow(SleeperShapeError);
  });

  it("rejects a season that is not a number, which is the same NaN path", () => {
    // `season` lands in `season integer not null`; a non-numeric string
    // reaches Postgres as NaN exactly as an absent one does.
    expect(() =>
      validateSleeperLeague({ ...sleeperLeaguePayload(), season: "off-season" }, "/league/1")
    ).toThrow(SleeperShapeError);
  });

  it("rejects a payload with no name instead of passing null to the schema", () => {
    expect(() =>
      validateSleeperLeague(without(sleeperLeaguePayload(), "name"), "/league/1234567890")
    ).toThrow(SleeperShapeError);
  });

  it("rejects a payload with no league_id", () => {
    expect(() =>
      validateSleeperLeague(without(sleeperLeaguePayload(), "league_id"), "/league/1234567890")
    ).toThrow(SleeperShapeError);
  });

  it("names the endpoint and the field, so the failure is debuggable", () => {
    expect(() =>
      validateSleeperLeague(without(sleeperLeaguePayload(), "season"), "/league/1234567890")
    ).toThrow(/Sleeper[\s\S]*\/league\/1234567890[\s\S]*season/);
  });

  it("rejects a body that is not an object", () => {
    expect(() => validateSleeperLeague([], "/league/1")).toThrow(SleeperShapeError);
    expect(() => validateSleeperLeague("nope", "/league/1")).toThrow(SleeperShapeError);
  });

  it("tolerates the optional settings blocks being absent", () => {
    // docs/SLEEPER.md#incomplete-data: a league missing roster positions is
    // unusual, not malformed — the commissioner overrides it in review.
    const bare = without(
      without(without(sleeperLeaguePayload(), "settings"), "scoring_settings"),
      "roster_positions"
    );
    const league = validateSleeperLeague(bare, "/league/1234567890");

    expect(league.settings).toBeNull();
    expect(league.scoring_settings).toBeNull();
    expect(league.roster_positions).toBeNull();
  });

  it("rejects roster_positions holding a non-string", () => {
    expect(() =>
      validateSleeperLeague(
        { ...sleeperLeaguePayload(), roster_positions: ["QB", 7] },
        "/league/1234567890"
      )
    ).toThrow(SleeperShapeError);
  });
});

describe("validateSleeperRosters", () => {
  it("returns every roster", () => {
    const rosters = validateSleeperRosters(sleeperRostersPayload(), "/league/1/rosters");

    expect(rosters).toHaveLength(2);
    expect(rosters[0].roster_id).toBe(1);
    expect(rosters[0].metadata?.team_name).toBe("The Hoodlums");
  });

  it("keeps an unowned roster, which is a documented normal case", () => {
    const rosters = validateSleeperRosters(sleeperRostersPayload(), "/league/1/rosters");

    expect(rosters[1].owner_id).toBeNull();
  });

  it("rejects a roster with no roster_id, which is the draft_position", () => {
    const [first, second] = sleeperRostersPayload();

    expect(() =>
      validateSleeperRosters([first, without(second, "roster_id")], "/league/1/rosters")
    ).toThrow(SleeperShapeError);
  });

  it("rejects a non-numeric roster_id", () => {
    expect(() =>
      validateSleeperRosters([{ roster_id: "1", owner_id: null }], "/league/1/rosters")
    ).toThrow(SleeperShapeError);
  });

  it("rejects a body that is not an array", () => {
    expect(() => validateSleeperRosters({}, "/league/1/rosters")).toThrow(SleeperShapeError);
  });
});

describe("validateSleeperUsers", () => {
  it("returns every user", () => {
    const users = validateSleeperUsers(sleeperUsersPayload(), "/league/1/users");

    expect(users).toHaveLength(2);
    expect(users[0].display_name).toBe("Adam Hood");
    expect(users[1].avatar).toBeNull();
  });

  it("rejects a user with no user_id, which is how rosters find their owner", () => {
    expect(() =>
      validateSleeperUsers([without(sleeperUsersPayload()[0], "user_id")], "/league/1/users")
    ).toThrow(SleeperShapeError);
  });

  it("tolerates a missing display_name, which only feeds a team-name fallback", () => {
    const users = validateSleeperUsers(
      [without(sleeperUsersPayload()[0], "display_name")],
      "/league/1/users"
    );

    expect(users[0].display_name).toBe("");
  });

  it("rejects a body that is not an array", () => {
    expect(() => validateSleeperUsers(null, "/league/1/users")).toThrow(SleeperShapeError);
  });
});

describe("validateSleeperDrafts", () => {
  it("returns the draft settings the import consumes", () => {
    const drafts = validateSleeperDrafts(sleeperDraftsPayload(), "/league/1/drafts");

    expect(drafts[0].draft_id).toBe("draft_123");
    expect(drafts[0].settings?.seconds_per_pick).toBe(60);
  });

  it("tolerates a league with no drafts yet", () => {
    expect(validateSleeperDrafts([], "/league/1/drafts")).toEqual([]);
  });

  it("drops a non-integer seconds_per_pick so the integer column never sees it", () => {
    const drafts = validateSleeperDrafts(
      [{ draft_id: "draft_123", type: "snake", settings: { seconds_per_pick: 60.5 } }],
      "/league/1/drafts"
    );

    // transformDraftSettings then falls back to its documented 60s default.
    expect(drafts[0].settings?.seconds_per_pick).toBeUndefined();
  });

  it("rejects a draft with no draft_id", () => {
    expect(() =>
      validateSleeperDrafts([without(sleeperDraftsPayload()[0], "draft_id")], "/league/1/drafts")
    ).toThrow(SleeperShapeError);
  });
});

describe("validateSleeperUserLookup", () => {
  it("returns the identity stored against the Draft House user", () => {
    const user = validateSleeperUserLookup(sleeperUserLookupPayload(), "/user/adamhood");

    expect(user.user_id).toBe("user_123");
    expect(user.username).toBe("adamhood");
  });

  it("rejects a lookup with no user_id, which is interpolated into the next URL", () => {
    expect(() =>
      validateSleeperUserLookup(without(sleeperUserLookupPayload(), "user_id"), "/user/adamhood")
    ).toThrow(SleeperShapeError);
  });
});

describe("validateSleeperNflState", () => {
  it("returns the current season", () => {
    expect(validateSleeperNflState(sleeperNflStatePayload(), "/state/nfl").season).toBe("2025");
  });

  it("normalizes a numeric season to a string", () => {
    expect(validateSleeperNflState({ season: 2025 }, "/state/nfl").season).toBe("2025");
  });

  it("rejects a non-numeric season", () => {
    expect(() => validateSleeperNflState({ season: "off-season" }, "/state/nfl")).toThrow(
      SleeperShapeError
    );
  });

  it("rejects a state with no season, which is interpolated into the next URL", () => {
    // Without this the next call is GET /user/{id}/leagues/nfl/undefined.
    expect(() =>
      validateSleeperNflState(without(sleeperNflStatePayload(), "season"), "/state/nfl")
    ).toThrow(SleeperShapeError);
  });
});

describe("validateSleeperLeagueSummaries", () => {
  it("returns every league the user belongs to", () => {
    const summaries = validateSleeperLeagueSummaries(
      sleeperLeagueSummariesPayload(),
      "/user/user_123/leagues/nfl/2025"
    );

    expect(summaries[0].league_id).toBe("1234567890");
    expect(summaries[0].total_rosters).toBe(12);
  });

  it("rejects a summary with no league_id, which is what the import is keyed on", () => {
    expect(() =>
      validateSleeperLeagueSummaries(
        [without(sleeperLeagueSummariesPayload()[0], "league_id")],
        "/user/user_123/leagues/nfl/2025"
      )
    ).toThrow(SleeperShapeError);
  });

  it("tolerates a missing name, which is display-only in the picker", () => {
    const summaries = validateSleeperLeagueSummaries(
      [without(sleeperLeagueSummariesPayload()[0], "name")],
      "/user/user_123/leagues/nfl/2025"
    );

    expect(summaries[0].name).toBe("");
  });

  it("rejects a body that is not an array", () => {
    expect(() =>
      validateSleeperLeagueSummaries({}, "/user/user_123/leagues/nfl/2025")
    ).toThrow(SleeperShapeError);
  });
});
