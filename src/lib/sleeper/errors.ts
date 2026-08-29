/**
 * Sleeper failure taxonomy. Its own module so `validate.ts` can raise these
 * without importing `client.ts`, which imports the validators back.
 *
 * These are re-exported from `client.ts`, which stays the import site for
 * callers outside this directory.
 */

/** GET /league/{id} returns HTTP 404 with a `null` body for an unknown league — verified against the live API. */
export class SleeperNotFoundError extends Error {}

/** Network failure or non-404 error, after exhausting retries. See docs/SLEEPER.md#network-timeout. */
export class SleeperUnavailableError extends Error {}

/**
 * Sleeper answered, but not in the shape Draft House reads. Sleeper is an
 * unversioned public API with no contract, so this is a question of when, not
 * if — and the response is the same either way: fail at the boundary, naming
 * Sleeper, rather than let a missing field travel on as a null into a
 * `not null` column and surface as a Postgres error three layers down.
 *
 * Extends `SleeperUnavailableError` deliberately: callers already branch on
 * that to mean "Sleeper could not give us what we asked for, try again", which
 * is exactly the user-facing outcome here.
 */
export class SleeperShapeError extends SleeperUnavailableError {}
