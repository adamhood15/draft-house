import { describe, expect, it } from "vitest";
import {
  filterPlayers,
  positionCounts,
  rankPlayers,
  type PlayerRow,
} from "@/lib/players/rankings";

/**
 * The board is built against empty tables for now, so these tests are the only
 * thing exercising the ordering rules. The one that matters most is the
 * unranked case: Dynasty Dealer's feed is top-1000 and covers QB/RB/WR/TE
 * only, so in this league — which is IDP — most of the pool has no value at
 * all. A ranking that quietly sorts those players as zero would look complete
 * and be wrong.
 */

function player(overrides: Partial<PlayerRow> = {}): PlayerRow {
  return {
    player_id: "p1",
    full_name: "Player One",
    first_name: null,
    last_name: null,
    position: "RB",
    team: "ATL",
    age: 24,
    injury_status: null,
    value: 100,
    projected_points: null,
    bye_week: null,
    drafted_by_team_id: null,
    drafted_at_pick_no: null,
    ...overrides,
  };
}

describe("rankPlayers", () => {
  it("orders by value, highest first", () => {
    const ranked = rankPlayers([
      player({ player_id: "b", full_name: "Bravo", value: 50 }),
      player({ player_id: "a", full_name: "Alpha", value: 9000 }),
      player({ player_id: "c", full_name: "Charlie", value: 500 }),
    ]);

    expect(ranked.map((p) => p.displayName)).toEqual(["Alpha", "Charlie", "Bravo"]);
    expect(ranked.map((p) => p.rank)).toEqual([1, 2, 3]);
  });

  it("puts unranked players last and leaves their rank null", () => {
    // NOT rank 0, and not sorted as value 0 — the UI has to render "—" so a
    // missing ranking reads as missing rather than as "worst player available".
    const ranked = rankPlayers([
      player({ player_id: "idp", full_name: "Linebacker", position: "LB", value: null }),
      player({ player_id: "wr", full_name: "Receiver", value: 8000 }),
    ]);

    expect(ranked.map((p) => p.displayName)).toEqual(["Receiver", "Linebacker"]);
    expect(ranked.map((p) => p.rank)).toEqual([1, null]);
  });

  it("does not let unranked players consume rank numbers", () => {
    // Two ranked players must be 1 and 2 even with unranked rows between them
    // in the input, or the numbers stop matching the list.
    const ranked = rankPlayers([
      player({ player_id: "x", value: null, full_name: "Unranked A" }),
      player({ player_id: "y", value: 900, full_name: "Ranked A" }),
      player({ player_id: "z", value: null, full_name: "Unranked B" }),
      player({ player_id: "w", value: 800, full_name: "Ranked B" }),
    ]);

    expect(ranked.filter((p) => p.rank !== null).map((p) => p.rank)).toEqual([1, 2]);
  });

  it("breaks ties by name so the order does not shuffle between renders", () => {
    const rows = [
      player({ player_id: "2", full_name: "Zulu", value: 500 }),
      player({ player_id: "1", full_name: "Alpha", value: 500 }),
    ];
    expect(rankPlayers(rows).map((p) => p.displayName)).toEqual(["Alpha", "Zulu"]);
    expect(rankPlayers([...rows].reverse()).map((p) => p.displayName)).toEqual(["Alpha", "Zulu"]);
  });

  it("does not mutate the array it was given", () => {
    const rows = [player({ player_id: "b", value: 1 }), player({ player_id: "a", value: 2 })];
    rankPlayers(rows);
    expect(rows.map((r) => r.player_id)).toEqual(["b", "a"]);
  });

  it("falls back through full name, then first/last, then the id", () => {
    expect(rankPlayers([player({ full_name: "Bijan Robinson" })])[0].displayName).toBe(
      "Bijan Robinson"
    );
    expect(
      rankPlayers([player({ full_name: null, first_name: "Bijan", last_name: "Robinson" })])[0]
        .displayName
    ).toBe("Bijan Robinson");
    // A nameless row is broken, not blank — showing the id gives something to chase.
    expect(
      rankPlayers([player({ player_id: "4034", full_name: null })])[0].displayName
    ).toBe("4034");
  });

  it("marks a player who already holds a slot as drafted", () => {
    const ranked = rankPlayers([
      player({ drafted_by_team_id: "team-3", drafted_at_pick_no: 14 }),
      player({ player_id: "p2" }),
    ]);
    expect(ranked.map((p) => p.isDrafted)).toEqual([true, false]);
  });

  it("returns nothing for an empty pool rather than throwing", () => {
    // The live case today: the player sync has not been built, so the board
    // renders against zero rows.
    expect(rankPlayers([])).toEqual([]);
  });
});

describe("filterPlayers", () => {
  const pool = rankPlayers([
    player({ player_id: "1", full_name: "Ja'Marr Chase", position: "WR", team: "CIN", value: 9000 }),
    player({ player_id: "2", full_name: "Bijan Robinson", position: "RB", team: "ATL", value: 8000 }),
    player({ player_id: "3", full_name: "Josh Allen", position: "QB", team: "BUF", value: 7000 }),
    player({
      player_id: "4",
      full_name: "Drafted Guy",
      position: "TE",
      team: "KC",
      value: 6000,
      drafted_by_team_id: "team-1",
      drafted_at_pick_no: 3,
    }),
  ]);

  it("returns everything when nothing is filtered", () => {
    expect(filterPlayers(pool, {})).toHaveLength(4);
  });

  it("matches a search ignoring case and punctuation", () => {
    // "jamarr" must find "Ja'Marr" — the apostrophe is exactly what a person
    // typing quickly leaves out.
    expect(filterPlayers(pool, { search: "jamarr" }).map((p) => p.player_id)).toEqual(["1"]);
    expect(filterPlayers(pool, { search: "JA'MARR" }).map((p) => p.player_id)).toEqual(["1"]);
    expect(filterPlayers(pool, { search: "robinson" }).map((p) => p.player_id)).toEqual(["2"]);
  });

  it("searches team as well as name", () => {
    expect(filterPlayers(pool, { search: "buf" }).map((p) => p.player_id)).toEqual(["3"]);
  });

  it("filters to the chosen positions", () => {
    expect(filterPlayers(pool, { positions: ["WR", "RB"] }).map((p) => p.player_id)).toEqual([
      "1",
      "2",
    ]);
  });

  it("treats an empty position list as no filter", () => {
    expect(filterPlayers(pool, { positions: [] })).toHaveLength(4);
  });

  it("hides drafted players when asked", () => {
    expect(filterPlayers(pool, { hideDrafted: true }).map((p) => p.player_id)).toEqual([
      "1",
      "2",
      "3",
    ]);
  });

  it("combines filters rather than picking one", () => {
    expect(
      filterPlayers(pool, { positions: ["WR", "TE"], hideDrafted: true }).map((p) => p.player_id)
    ).toEqual(["1"]);
  });

  it("keeps the ranking order it was given", () => {
    expect(filterPlayers(pool, { search: "a" }).map((p) => p.rank)).toEqual(
      filterPlayers(pool, { search: "a" })
        .map((p) => p.rank)
        .sort((a, b) => a! - b!)
    );
  });
});

describe("positionCounts", () => {
  it("counts the whole pool, so the pills don't move as you type", () => {
    const counts = positionCounts(
      rankPlayers([
        player({ player_id: "1", position: "WR" }),
        player({ player_id: "2", position: "WR" }),
        player({ player_id: "3", position: "QB" }),
        player({ player_id: "4", position: null }),
      ])
    );
    expect(counts).toEqual({ WR: 2, QB: 1 });
  });
});
