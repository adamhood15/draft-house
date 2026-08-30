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
 *   settings blocks, `display_name`, `pick_timer`. Absent means take the
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
 * A URL Sleeper supplies whole, rather than an id we build a URL from. It ends
 * up in an `<img src>`, so the scheme is checked here at the boundary: a
 * `javascript:` or `data:` value from an attacker-controlled profile field must
 * never reach the database, let alone the page. Anything that isn't a parseable
 * https URL is dropped, and the caller falls back as if it were absent.
 */
function httpsUrlOrNull(source: Record<string, unknown>, field: string) {
  const value = source[field];
  if (typeof value !== "string" || value === "") return null;
  try {
    return new URL(value).protocol === "https:" ? value : null;
  } catch {
    return null;
  }
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

/**
 * Same, but 0 is a value rather than a missing one. `pick_timer: 0` is how
 * Sleeper says "unlimited time"; treating it as absent would silently restore
 * the 60-second default on exactly the leagues that turned the clock off.
 */
function optionalNonNegativeInteger(source: Record<string, unknown>, field: string) {
  const value = source[field];
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : undefined;
}

/** Epoch milliseconds. Absent, null, or non-finite all mean "not scheduled". */
function nullableEpochMs(source: Record<string, unknown>, field: string) {
  const value = source[field];
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * An object kept verbatim for a jsonb column. Nothing inside is inspected —
 * that is the point: it is the provenance copy, and narrowing it here would
 * discard exactly the unanticipated fields it exists to preserve.
 */
function optionalRecord(
  source: Record<string, unknown>,
  field: string,
  context: string
): Record<string, unknown> | null {
  const value = source[field];
  if (value === undefined || value === null) return null;
  return requireObject(value, context, field);
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
    // The league's current draft. Preferred over GET /league/<id>/drafts,
    // whose array spans prior seasons — see fetchSleeperDraft.
    draft_id: nullableString(league, "draft_id"),
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
      // Identifies the team, and is the fallback seat ordering when the
      // draft order is unset. The seat itself comes from the draft draft_order
      // map (src/lib/sleeper/draft-order.ts), not from here.
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

    // Sleeper keeps the manager's chosen team name and uploaded team avatar
    // here, NOT on the roster — GET /league/<id>/rosters carries notification
    // preferences and nothing else. See transformTeams.
    const metadata =
      user.metadata === undefined || user.metadata === null
        ? null
        : requireObject(user.metadata, context, "user metadata");

    return {
      // Rosters are matched to owners on this, so it has to be real.
      user_id: requireString(user, "user_id", context),
      // Only feeds the team-name fallback chain, which ends at "Team {n}".
      display_name: optionalString(user, "display_name"),
      avatar: nullableString(user, "avatar"),
      metadata: metadata
        ? {
            team_name: nullableString(metadata, "team_name") ?? undefined,
            // Unlike the `avatar` id above, this is a fully-qualified URL that
            // Sleeper hands back verbatim. It is rendered in an <img src>, so
            // anything but https is dropped rather than stored.
            avatar: httpsUrlOrNull(metadata, "avatar") ?? undefined,
          }
        : null,
    };
  });
}

/**
 * One draft object, from either GET /draft/<draft_id> or an entry in
 * GET /league/<league_id>/drafts. The two carry the same shape; only the
 * single-draft endpoint includes slot_to_roster_id.
 */
function validateDraftObject(entry: unknown, context: string): SleeperDraft {
  const draft = requireObject(entry, context, "a draft");
  const settings = optionalRecord(draft, "settings", context);

  return {
    draft_id: requireString(draft, "draft_id", context),
    type: optionalString(draft, "type"),
    status: optionalString(draft, "status"),
    sport: optionalString(draft, "sport"),
    // Lenient: drafts.season is `integer not null`, but the league carries the
    // same season and transformDraft falls back to it. Failing the whole import
    // over a field we already have from another endpoint would be gratuitous.
    season: optionalString(draft, "season"),
    season_type: optionalString(draft, "season_type"),
    start_time: nullableEpochMs(draft, "start_time"),
    settings: settings
      ? {
          rounds: optionalPositiveInteger(settings, "rounds"),
          // The real field name. Sleeper has no `seconds_per_pick`, and reading
          // one meant every imported league quietly took the 60s default
          // regardless of what its commissioner had set.
          pick_timer: optionalNonNegativeInteger(settings, "pick_timer"),
        }
      : null,
    // Kept whole for the jsonb columns — see the note on optionalRecord.
    raw_settings: settings,
    metadata: optionalRecord(draft, "metadata", context),
    // user_id -> slot, one source of teams.draft_position. Null before the
    // commissioner sets the order in Sleeper, which is an ordinary pre-draft
    // state (see assignDraftPositions).
    draft_order: optionalNumericRecord(draft, "draft_order", context),
    // slot -> Sleeper roster_id. The authoritative seat mapping when present,
    // and it is only present on GET /draft/<draft_id>.
    slot_to_roster_id: optionalNumericRecord(draft, "slot_to_roster_id", context),
  };
}

export function validateSleeperDraft(body: unknown, context: string): SleeperDraft {
  return validateDraftObject(body, context);
}

export function validateSleeperDrafts(body: unknown, context: string): SleeperDraft[] {
  return requireArray(body, context, "the draft list").map((entry) =>
    validateDraftObject(entry, context)
  );
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
