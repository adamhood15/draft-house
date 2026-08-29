import "server-only";
import {
  SleeperNotFoundError,
  SleeperShapeError,
  SleeperUnavailableError,
} from "@/lib/sleeper/errors";
import {
  validateSleeperDrafts,
  validateSleeperLeague,
  validateSleeperLeagueSummaries,
  validateSleeperNflState,
  validateSleeperRosters,
  validateSleeperUserLookup,
  validateSleeperUsers,
} from "@/lib/sleeper/validate";

export { SleeperNotFoundError, SleeperShapeError, SleeperUnavailableError };

const BASE_URL = process.env.SLEEPER_API_BASE_URL ?? "https://api.sleeper.app/v1";
const TIMEOUT_MS = Number(process.env.SLEEPER_API_TIMEOUT ?? 10000);
const MAX_ATTEMPTS = 3;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Every Sleeper response passes through a validator before it leaves this
 * module — see validate.ts. Sleeper publishes no contract, so a raw
 * `body as T` would only move the failure downstream, where it surfaces as a
 * database error with nothing naming Sleeper as the cause.
 */
async function sleeperFetch<T>(
  path: string,
  validate: (body: unknown, context: string) => T
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const res = await fetch(`${BASE_URL}${path}`, { signal: controller.signal });

      if (res.status === 404) {
        throw new SleeperNotFoundError(`Sleeper resource not found: ${path}`);
      }
      if (!res.ok) {
        throw new Error(`Sleeper API error ${res.status} for ${path}`);
      }

      const body = await res.json();
      if (body === null) {
        throw new SleeperNotFoundError(`Sleeper resource not found: ${path}`);
      }
      return validate(body, path);
    } catch (error) {
      // Neither of these gets better on a retry: the resource is absent, or
      // the payload is the shape it is and will be again next attempt.
      if (error instanceof SleeperNotFoundError) throw error;
      if (error instanceof SleeperShapeError) throw error;
      lastError = error;
      if (attempt < MAX_ATTEMPTS) {
        await wait(2 ** attempt * 250);
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw new SleeperUnavailableError(
    lastError instanceof Error ? lastError.message : "Sleeper API unavailable"
  );
}

export function fetchSleeperLeague(leagueId: string) {
  return sleeperFetch(`/league/${leagueId}`, validateSleeperLeague);
}

export function fetchSleeperRosters(leagueId: string) {
  return sleeperFetch(`/league/${leagueId}/rosters`, validateSleeperRosters);
}

export function fetchSleeperUsers(leagueId: string) {
  return sleeperFetch(`/league/${leagueId}/users`, validateSleeperUsers);
}

export function fetchSleeperDrafts(leagueId: string) {
  return sleeperFetch(`/league/${leagueId}/drafts`, validateSleeperDrafts);
}

/** GET /user/{username} 200s with a `null` body for an unknown username — no 404 here, unlike /league. */
export function fetchSleeperUserByUsername(username: string) {
  return sleeperFetch(`/user/${encodeURIComponent(username)}`, validateSleeperUserLookup);
}

export function fetchSleeperLeaguesForUser(userId: string, season: string) {
  return sleeperFetch(`/user/${userId}/leagues/nfl/${season}`, validateSleeperLeagueSummaries);
}

/** Authoritative "current season" per Sleeper — avoids guessing from the calendar date. */
export function fetchNflState() {
  return sleeperFetch(`/state/nfl`, validateSleeperNflState);
}
