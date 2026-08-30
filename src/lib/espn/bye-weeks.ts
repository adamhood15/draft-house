/**
 * Bye weeks, derived from the NFL schedule.
 *
 * Sleeper's GET /players/nfl carries no bye week — verified absent across all
 * 12,225 players — so it is inferred: a team with no game in week W has its
 * bye in week W. ESPN's public scoreboard is the schedule source, read once per
 * season (18 requests) into team_bye_weeks rather than onto each player. See
 * the note in 20260830000003_players_and_bye_weeks.sql for why that is a table.
 *
 * The derivation is pure and separated from the fetch so the reasoning above
 * can be tested without a network.
 */

/** NFL regular season length. Weeks are 1-indexed. */
export const REGULAR_SEASON_WEEKS = 18;

/**
 * ESPN abbreviation -> Sleeper abbreviation, for the ones that disagree.
 *
 * Verified 2026-08-30 by diffing both vocabularies:
 *   in Sleeper but not ESPN:  OAK  WAS
 *   in ESPN but not Sleeper:  WSH
 *
 * WAS/WSH is one team spelled two ways, and it is the entire disagreement —
 * every other abbreviation matches. Left unmapped it produces no error and no
 * failed row: Washington players simply carry a null bye until someone notices.
 *
 * OAK is not here because it is not a spelling difference. Sleeper still tags
 * some active players to Oakland, a team that has not existed since 2019; ESPN
 * has no such team and never will. Those players resolve to no bye, correctly.
 */
export const SLEEPER_TEAM_BY_ESPN: Readonly<Record<string, string>> = {
  WSH: "WAS",
};

/** One week of the schedule: the teams that played. */
export type WeekSchedule = {
  week: number;
  /** ESPN abbreviations, as returned by the scoreboard. */
  teams: string[];
};

export type ByeWeekResult = {
  /** Sleeper abbreviation -> bye week. */
  byeWeeks: Map<string, number>;
  /**
   * Teams that appear in every week, so no bye could be derived. Expected to
   * be empty; a non-empty list means the schedule is not what we assumed.
   */
  teamsWithoutBye: string[];
  /**
   * Derived teams that match nothing in the caller's known vocabulary — the
   * WAS/WSH failure showing itself instead of hiding. Only populated when
   * `knownTeams` is supplied.
   */
  unmatchedTeams: string[];
};

/** ESPN's abbreviation in Sleeper's vocabulary. */
export function toSleeperTeam(espnAbbreviation: string): string {
  return SLEEPER_TEAM_BY_ESPN[espnAbbreviation] ?? espnAbbreviation;
}

/**
 * Turns a full season's schedule into a bye week per team.
 *
 * @param knownTeams Sleeper's team vocabulary — `select distinct team from
 *   players`. Optional, and only used to report mismatches: passing it turns a
 *   silent null bye into a named entry in `unmatchedTeams`.
 */
export function deriveByeWeeks(
  schedule: WeekSchedule[],
  knownTeams?: Iterable<string>
): ByeWeekResult {
  // Every week must be present. A single failed request would otherwise read
  // as "nobody played that week", handing all 32 teams the same false bye —
  // a complete, plausible, entirely wrong answer, which is worse than none.
  const byWeek = new Map<number, Set<string>>();
  for (const entry of schedule) {
    if (byWeek.has(entry.week)) {
      throw new Error(`Week ${entry.week} appears twice in the schedule.`);
    }
    byWeek.set(entry.week, new Set(entry.teams.map(toSleeperTeam)));
  }

  const missing = Array.from({ length: REGULAR_SEASON_WEEKS }, (_, i) => i + 1).filter(
    (week) => !byWeek.has(week)
  );
  if (missing.length > 0) {
    throw new Error(
      `Cannot derive bye weeks: no schedule for week(s) ${missing.join(", ")}. ` +
        `A gap would give every team a false bye, so this refuses rather than guessing.`
    );
  }

  const allTeams = new Set<string>();
  for (const teams of byWeek.values()) {
    for (const team of teams) allTeams.add(team);
  }

  const byeWeeks = new Map<string, number>();
  const teamsWithoutBye: string[] = [];

  for (const team of allTeams) {
    let bye: number | undefined;
    for (let week = 1; week <= REGULAR_SEASON_WEEKS; week++) {
      if (!byWeek.get(week)!.has(team)) {
        bye = week;
        break;
      }
    }
    if (bye === undefined) teamsWithoutBye.push(team);
    else byeWeeks.set(team, bye);
  }

  const known = knownTeams ? new Set(knownTeams) : null;
  const unmatchedTeams = known
    ? [...byeWeeks.keys()].filter((team) => !known.has(team)).sort()
    : [];

  return { byeWeeks, teamsWithoutBye: teamsWithoutBye.sort(), unmatchedTeams };
}
