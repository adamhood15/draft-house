import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchNflState,
  fetchSleeperLeague,
  fetchSleeperRosters,
  SleeperNotFoundError,
  SleeperShapeError,
  SleeperUnavailableError,
} from "@/lib/sleeper/client";
import {
  sleeperLeaguePayload,
  sleeperRostersPayload,
  without,
} from "@/lib/sleeper/__fixtures__/payloads";

/**
 * The Sleeper boundary itself. Every payload here is a fixture — a test must
 * never reach the live API (docs/TESTING.md#writing-tests).
 */

function respondWith(body: unknown, status = 200) {
  const fetchMock = vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("fetchSleeperLeague", () => {
  it("returns the league for a well-formed payload", async () => {
    respondWith(sleeperLeaguePayload());

    await expect(fetchSleeperLeague("1234567890")).resolves.toMatchObject({
      league_id: "1234567890",
      season: "2025",
    });
  });

  it("rejects a payload missing a field the schema requires", async () => {
    // The whole point: this used to be `return body as T`, so a Sleeper change
    // surfaced as a Postgres not-null violation during the insert instead.
    respondWith(without(sleeperLeaguePayload(), "season"));

    await expect(fetchSleeperLeague("1234567890")).rejects.toThrow(SleeperShapeError);
  });

  it("reports the failure as unavailable, keeping the import error taxonomy intact", async () => {
    respondWith(without(sleeperLeaguePayload(), "name"));

    // import.ts branches on SleeperUnavailableError for its 502; a shape
    // failure has to be caught there rather than falling through to a 500.
    await expect(fetchSleeperLeague("1234567890")).rejects.toBeInstanceOf(
      SleeperUnavailableError
    );
  });

  it("does not retry a shape failure — the same payload comes back every time", async () => {
    const fetchMock = respondWith(without(sleeperLeaguePayload(), "season"));

    await expect(fetchSleeperLeague("1234567890")).rejects.toThrow(SleeperShapeError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("still raises not-found for a 404", async () => {
    respondWith(null, 404);

    await expect(fetchSleeperLeague("1234567890")).rejects.toThrow(SleeperNotFoundError);
  });

  it("still raises not-found for a 200 with a null body", async () => {
    // Documented on fetchSleeperUserByUsername; /league does it too.
    respondWith(null);

    await expect(fetchSleeperLeague("1234567890")).rejects.toThrow(SleeperNotFoundError);
  });

  it("still retries a network failure before giving up", async () => {
    // On real timers this test sleeps through the `2 ** attempt * 250` backoff
    // in client.ts — 1.5s, and an assertion that only holds while the machine
    // is idle. Fake the clock instead of paying for it.
    vi.useFakeTimers();
    try {
      const fetchMock = vi.fn(async () => {
        throw new Error("connect ECONNREFUSED");
      });
      vi.stubGlobal("fetch", fetchMock);

      // Start awaiting the rejection before advancing, or the timers fire
      // against a promise nothing is holding yet.
      const pending = expect(fetchSleeperLeague("1234567890")).rejects.toThrow(
        SleeperUnavailableError
      );
      // runAllTimersAsync, not runAllTimers: only the async form drains the
      // awaited `wait()` between attempts.
      await vi.runAllTimersAsync();
      await pending;

      expect(fetchMock).toHaveBeenCalledTimes(3);
    } finally {
      // A leaked fake clock would follow every later test in this file.
      vi.useRealTimers();
    }
  });
});

describe("fetchSleeperRosters", () => {
  it("returns the rosters for a well-formed payload", async () => {
    respondWith(sleeperRostersPayload());

    await expect(fetchSleeperRosters("1234567890")).resolves.toHaveLength(2);
  });

  it("rejects an object where Sleeper documents an array", async () => {
    respondWith({ rosters: [] });

    await expect(fetchSleeperRosters("1234567890")).rejects.toThrow(SleeperShapeError);
  });
});

describe("fetchNflState", () => {
  it("rejects a state with no season rather than building a URL with undefined in it", async () => {
    respondWith({ season_type: "regular" });

    await expect(fetchNflState()).rejects.toThrow(SleeperShapeError);
  });
});
