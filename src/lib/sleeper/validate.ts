import { SleeperShapeError } from "@/lib/sleeper/errors";
import type {
  SleeperDraft,
  SleeperLeague,
  SleeperLeagueSummary,
  SleeperNflState,
  SleeperRoster,
  SleeperUser,
  SleeperUserLookup,
} from "@/lib/sleeper/types";

/**
 * Shape validation for every Sleeper response Draft House reads, one validator
 * per endpoint. `client.ts` runs these before any payload leaves the boundary,
 * so nothing downstream has to defend itself against a field Sleeper stopped
 * sending (docs/ENGINEERING.md#code-conventions, "untrusted input stays
 * untrusted").
 *
 * Two rules decide whether a field is required:
 *
 * - **Required** when Draft House writes it to a `not null` column and has no
 *   documented default — `season`, `name`, `roster_id`. Absent means fail here.
 * - **Optional** when a default or fallback is already documented — the
 *   settings blocks, `display_name`, `seconds_per_pick`. Absent means take the
 *   default, exactly as before.
 *
 * Unknown extra fields pass through untouched. Sleeper adds fields freely, and
 * an import must not break because it did.
 */

function fail(context: string, detail: string): never {
  throw new SleeperShapeError(
    `Sleeper response for ${context} is not the shape Draft House reads: ${detail}`
  );
}

function describeType(value: unknown) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  return typeof value;
}

function requireObject(value: unknown, context: string, what: string) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(context, `expected ${what} to be an object, got ${describeType(value)}`);
  }
  return value as Record<string, unknown>;
}

function requireArray(value: unknown, context: string, what: string) {
  if (!Array.isArray(value)) {
    fail(context, `expected ${what} to be an array, got ${describeType(value)}`);
  }
  return value as unknown[];
}

function requireString(source: Record<string, unknown>, field: string, context: string) {
  const value = source[field];
  if (typeof value !== "string" || value === "") {
    fail(context, `${field} must be a non-empty string, got ${describeType(value)}`);
  }
  return value as string;
}

/** For fields with a documented fallback — absent is not a failure, it is the default. */
function optionalString(source: Record<string, unknown>, field: string) {
  const value = source[field];
  return typeof value === "string" ? value : "";
}

function nullableString(source: Record<string, unknown>, field: string) {
  const value = source[field];
  return typeof value === "string" && value !== "" ? value : null;
}

/**
 * docs/SLEEPER.md#1-get-league shows `"season": 2025` unquoted while types.ts
 * declares a string, and the live API sends a string. Accept either rather than
 * bet the import on which one is right.
 *
 * It must still be a whole number: `leagues.season` is `integer not null`, and
 * a non-numeric string reaches Postgres as NaN exactly as an absent one does.
 */
function requireSeason(source: Record<string, unknown>, context: string) {
  const value = source.season;
  const asNumber =
    typeof value === "string" && value.trim() !== ""
      ? Number(value)
      : typeof value === "number"
        ? value
        : NaN;

  if (!Number.isInteger(asNumber)) {
    fail(context, `season must be a whole number, got ${describeType(value)}`);
  }
  return String(asNumber);
}

function requireInteger(source: Record<string, unknown>, field: string, context: string) {
  const value = source[field];
  if (typeof value !== "number" || !Number.isInteger(value)) {
    fail(context, `${field} must be an integer, got ${describeType(value)}`);
  }
  return value as number;
}

/** Integer columns reject 60.5 as hard as they reject null; drop it and let the default stand. */
function optionalPositiveInteger(source: Record<string, unknown>, field: string) {
  const value = source[field];
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

function optionalNumericRecord(
  source: Record<string, unknown>,
  field: string,
  context: string
): Record<string, number> | null {
  const value = source[field];
  if (value === undefined || value === null) return null;

  const record = requireObject(value, context, field);
  const numeric: Record<string, number> = {};
  for (const [key, entry] of Object.entries(record)) {
    if (typeof entry === "number" && Number.isFinite(entry)) {
      numeric[key] = entry;
    }
  }
  return numeric;
}

export function validateSleeperLeague(body: unknown, context: string): SleeperLeague {
  const league = requireObject(body, context, "the league");

  let rosterPositions: string[] | null = null;
  if (league.roster_positions !== undefined && league.roster_positions !== null) {
    const entries = requireArray(league.roster_positions, context, "roster_positions");
    if (entries.some((entry) => typeof entry !== "string")) {
      fail(context, "roster_positions must hold only strings");
    }
    rosterPositions = entries as string[];
  }

  return {
    league_id: requireString(league, "league_id", context),
    name: requireString(league, "name", context),
    season: requireSeason(league, context),
    // Validation-only per docs/SLEEPER.md#league-settings, never written.
    status: optionalString(league, "status"),
    // Stored verbatim as the `league_settings` backup copy, so it is kept as
    // Sleeper sent it rather than filtered down to the numeric entries.
    settings:
      league.settings === undefined || league.settings === null
        ? null
        : requireObject(league.settings, context, "settings"),
    scoring_settings: optionalNumericRecord(league, "scoring_settings", context),
    roster_positions: rosterPositions,
  };
}

export function validateSleeperRosters(body: unknown, context: string): SleeperRoster[] {
  return requireArray(body, context, "the roster list").map((entry) => {
    const roster = requireObject(entry, context, "a roster");
    const metadata =
      roster.metadata === undefined || roster.metadata === null
        ? null
        : requireObject(roster.metadata, context, "roster metadata");

    return {
      // Becomes `teams.draft_position`, which is `integer not null`.
      roster_id: requireInteger(roster, "roster_id", context),
      // Null is normal here — docs/SLEEPER.md#emptyunowned-teams.
      owner_id: nullableString(roster, "owner_id"),
      metadata: metadata ? { team_name: optionalString(metadata, "team_name") || undefined } : null,
    };
  });
}

export function validateSleeperUsers(body: unknown, context: string): SleeperUser[] {
  return requireArray(body, context, "the user list").map((entry) => {
    const user = requireObject(entry, context, "a user");

    return {
      // Rosters are matched to owners on this, so it has to be real.
      user_id: requireString(user, "user_id", context),
      // Only feeds the team-name fallback chain, which ends at "Team {n}".
      display_name: optionalString(user, "display_name"),
      avatar: nullableString(user, "avatar"),
    };
  });
}

export function validateSleeperDrafts(body: unknown, context: string): SleeperDraft[] {
  return requireArray(body, context, "the draft list").map((entry) => {
    const draft = requireObject(entry, context, "a draft");
    const settings =
      draft.settings === undefined || draft.settings === null
        ? null
        : requireObject(draft.settings, context, "draft settings");

    return {
      draft_id: requireString(draft, "draft_id", context),
      // Unread today — draft_format is fixed to snake in transform.ts.
      type: optionalString(draft, "type"),
      settings: settings
        ? { seconds_per_pick: optionalPositiveInteger(settings, "seconds_per_pick") }
        : null,
    };
  });
}

export function validateSleeperUserLookup(body: unknown, context: string): SleeperUserLookup {
  const user = requireObject(body, context, "the user");

  return {
    // Interpolated straight into the next request path.
    user_id: requireString(user, "user_id", context),
    // Written to `users.sleeper_username`.
    username: requireString(user, "username", context),
    display_name: optionalString(user, "display_name"),
    avatar: nullableString(user, "avatar"),
  };
}

export function validateSleeperLeagueSummaries(
  body: unknown,
  context: string
): SleeperLeagueSummary[] {
  return requireArray(body, context, "the league list").map((entry) => {
    const summary = requireObject(entry, context, "a league summary");

    return {
      // What the commissioner's chosen league is keyed on.
      league_id: requireString(summary, "league_id", context),
      // The rest is display-only in the picker; a blank cell beats a failed
      // lookup, and the real import re-fetches the league anyway.
      name: optionalString(summary, "name"),
      season: typeof summary.season === "number" ? String(summary.season) : optionalString(summary, "season"),
      total_rosters: typeof summary.total_rosters === "number" ? summary.total_rosters : 0,
      status: optionalString(summary, "status"),
    };
  });
}

export function validateSleeperNflState(body: unknown, context: string): SleeperNflState {
  const state = requireObject(body, context, "the NFL state");

  return {
    // Interpolated into the leagues-for-user path; undefined here would fetch
    // /user/{id}/leagues/nfl/undefined and 404 misleadingly.
    season: requireSeason(state, context),
    season_type: optionalString(state, "season_type"),
  };
}
