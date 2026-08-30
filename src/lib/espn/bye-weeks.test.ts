import { describe, expect, it } from "vitest";
import {
  REGULAR_SEASON_WEEKS,
  deriveByeWeeks,
  toSleeperTeam,
  type WeekSchedule,
} from "@/lib/espn/bye-weeks";

/**
 * The bug these guard against is not a crash. A wrong bye week is a plausible
 * integer in a column nobody checks — it surfaces weeks later, as a manager
 * starting a player on their bye. So the cases below are about producing
 * nothing rather than producing something wrong.
 */

const TEAMS = ["BUF", "MIA", "NE", "NYJ"];

/** A full season where `byes` names the week each team sits out. */
function season(byes: Record<string, number>, teams = TEAMS): WeekSchedule[] {
  return Array.from({ length: REGULAR_SEASON_WEEKS }, (_, index) => {
    const week = index + 1;
    return { week, teams: teams.filter((team) => byes[team] !== week) };
  });
}

describe("toSleeperTeam", () => {
  it("rewrites ESPN's WSH to Sleeper's WAS", () => {
    // The entire vocabulary disagreement between the two sources, and the one
    // that silently blanks a bye week if missed.
    expect(toSleeperTeam("WSH")).toBe("WAS");
  });

  it("passes through every abbreviation the two sources agree on", () => {
    for (const team of ["BUF", "KC", "SF", "LAR", "LV", "JAX", "TB"]) {
      expect(toSleeperTeam(team)).toBe(team);
    }
  });

  it("does not invent a mapping for OAK", () => {
    // Sleeper still tags players to Oakland; ESPN has no such team. Resolving
    // it to LV would assign those players Las Vegas's bye, which is a guess
    // dressed as data.
    expect(toSleeperTeam("OAK")).toBe("OAK");
  });
});

describe("deriveByeWeeks", () => {
  it("finds the week each team sits out", () => {
    const { byeWeeks } = deriveByeWeeks(season({ BUF: 7, MIA: 6, NE: 14, NYJ: 9 }));

    expect(Object.fromEntries(byeWeeks)).toEqual({ BUF: 7, MIA: 6, NE: 14, NYJ: 9 });
  });

  it("normalizes to Sleeper's vocabulary, so the result joins players.team", () => {
    const schedule = season({ WSH: 12, BUF: 7 }, ["WSH", "BUF"]);
    const { byeWeeks } = deriveByeWeeks(schedule);

    expect(byeWeeks.get("WAS")).toBe(12);
    expect(byeWeeks.has("WSH")).toBe(false);
  });

  it("refuses when a week is missing rather than inventing 32 byes", () => {
    // One failed request reads as "nobody played that week". Every team would
    // be absent, so every team would take that week as its bye — a full,
    // plausible, entirely wrong table.
    const incomplete = season({ BUF: 7 }).filter((week) => week.week !== 4);

    expect(() => deriveByeWeeks(incomplete)).toThrow(/week\(s\) 4/);
  });

  it("names every missing week, not just the first", () => {
    const incomplete = season({ BUF: 7 }).filter((week) => ![2, 11].includes(week.week));

    expect(() => deriveByeWeeks(incomplete)).toThrow(/2, 11/);
  });

  it("rejects a duplicated week instead of letting one overwrite the other", () => {
    const doubled = [...season({ BUF: 7 }), { week: 3, teams: TEAMS }];

    expect(() => deriveByeWeeks(doubled)).toThrow(/twice/);
  });

  it("reports a team that never sits out instead of omitting it silently", () => {
    const schedule = season({ MIA: 6 });
    const { byeWeeks, teamsWithoutBye } = deriveByeWeeks(schedule);

    expect(teamsWithoutBye).toEqual(["BUF", "NE", "NYJ"]);
    expect(byeWeeks.get("MIA")).toBe(6);
  });

  it("takes the first bye when a team sits out more than once", () => {
    const schedule = season({ BUF: 7 }).map((week) =>
      week.week === 12 ? { ...week, teams: week.teams.filter((t) => t !== "BUF") } : week
    );

    expect(deriveByeWeeks(schedule).byeWeeks.get("BUF")).toBe(7);
  });

  it("flags a derived team that matches nothing in Sleeper's vocabulary", () => {
    // This is the WAS/WSH failure made visible. Without knownTeams the result
    // looks complete and Washington quietly carries a null bye.
    const schedule = season({ BUF: 7, XYZ: 5 }, ["BUF", "XYZ"]);
    const { unmatchedTeams } = deriveByeWeeks(schedule, ["BUF", "WAS"]);

    expect(unmatchedTeams).toEqual(["XYZ"]);
  });

  it("reports nothing unmatched once the alias is applied", () => {
    const schedule = season({ WSH: 12, BUF: 7 }, ["WSH", "BUF"]);
    const { unmatchedTeams } = deriveByeWeeks(schedule, ["BUF", "WAS"]);

    expect(unmatchedTeams).toEqual([]);
  });

  it("leaves unmatchedTeams empty when no vocabulary is supplied", () => {
    const { unmatchedTeams } = deriveByeWeeks(season({ BUF: 7 }));

    expect(unmatchedTeams).toEqual([]);
  });
});
