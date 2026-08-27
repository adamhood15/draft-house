import "server-only";
import type {
  SleeperDraft,
  SleeperLeague,
  SleeperLeagueSummary,
  SleeperNflState,
  SleeperRoster,
  SleeperUser,
  SleeperUserLookup,
} from "@/lib/sleeper/types";

/** GET /league/{id} returns HTTP 404 with a `null` body for an unknown league — verified against the live API. */
export class SleeperNotFoundError extends Error {}

/** Network failure or non-404 error, after exhausting retries. See docs/SLEEPER.md#network-timeout. */
export class SleeperUnavailableError extends Error {}

const BASE_URL = process.env.SLEEPER_API_BASE_URL ?? "https://api.sleeper.app/v1";
const TIMEOUT_MS = Number(process.env.SLEEPER_API_TIMEOUT ?? 10000);
const MAX_ATTEMPTS = 3;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sleeperFetch<T>(path: string): Promise<T> {
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
      return body as T;
    } catch (error) {
      if (error instanceof SleeperNotFoundError) throw error;
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
  return sleeperFetch<SleeperLeague>(`/league/${leagueId}`);
}

export function fetchSleeperRosters(leagueId: string) {
  return sleeperFetch<SleeperRoster[]>(`/league/${leagueId}/rosters`);
}

export function fetchSleeperUsers(leagueId: string) {
  return sleeperFetch<SleeperUser[]>(`/league/${leagueId}/users`);
}

export function fetchSleeperDrafts(leagueId: string) {
  return sleeperFetch<SleeperDraft[]>(`/league/${leagueId}/drafts`);
}

/** GET /user/{username} 200s with a `null` body for an unknown username — no 404 here, unlike /league. */
export function fetchSleeperUserByUsername(username: string) {
  return sleeperFetch<SleeperUserLookup>(`/user/${encodeURIComponent(username)}`);
}

export function fetchSleeperLeaguesForUser(userId: string, season: string) {
  return sleeperFetch<SleeperLeagueSummary[]>(`/user/${userId}/leagues/nfl/${season}`);
}

/** Authoritative "current season" per Sleeper — avoids guessing from the calendar date. */
export function fetchNflState() {
  return sleeperFetch<SleeperNflState>(`/state/nfl`);
}
