// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { DraftBoardGrid } from "@/components/draft/draft-board";
import { buildDraftBoard } from "@/lib/draft/board";

/**
 * Renders the grid docs/DESIGN.md §9 describes. A table is used rather than a
 * CSS grid so the round and team headers are real <th> elements: a board this
 * dense is unreadable to a screen reader without them (§25).
 */

const LEAGUE_SIZE = 4;
const ROUNDS = 3;

const TEAMS = Array.from({ length: LEAGUE_SIZE }, (_, index) => ({
  id: `team-${index + 1}`,
  draft_house_team_name: `Team ${index + 1}`,
  draft_position: index + 1,
}));

type PickRow = Parameters<typeof buildDraftBoard>[0]["picks"][number];

/** An unmade slot. Slots and picks are one table now, so this is also the
    shape a completed pick takes, with the player fields filled in. */
function pending(pick_no: number, team_id = "team-1"): PickRow {
  return {
    pick_no,
    team_id,
    sleeper_player_id: null,
    player_name: null,
    player_position: null,
    player_nfl_team: null,
  };
}

const SLOTS: PickRow[] = Array.from({ length: LEAGUE_SIZE * ROUNDS }, (_, index) =>
  pending(index + 1)
);

/** SLOTS with one pick made. */
function withPick(pick_no: number, name: string, position: string, nflTeam: string): PickRow[] {
  return SLOTS.map((row) =>
    row.pick_no === pick_no
      ? {
          ...row,
          sleeper_player_id: `player-`,
          player_name: name,
          player_position: position,
          player_nfl_team: nflTeam,
        }
      : row
  );
}

function board(overrides: Partial<Parameters<typeof buildDraftBoard>[0]> = {}) {
  return buildDraftBoard({
    leagueSize: LEAGUE_SIZE,
    rounds: ROUNDS,
    orderType: "snake",
    teams: TEAMS,
    picks: SLOTS,
    currentPickNumber: null,
    ...overrides,
  });
}

describe("DraftBoardGrid headers", () => {
  it("lists every team across the top, first pick leftmost", () => {
    render(<DraftBoardGrid board={board()} />);
    const headers = screen.getAllByRole("columnheader").map((cell) => cell.textContent);
    expect(headers).toEqual(["RD", "Team 1", "Team 2", "Team 3", "Team 4"]);
  });

  it("numbers the rounds down the left edge", () => {
    render(<DraftBoardGrid board={board()} />);
    const rowHeaders = screen.getAllByRole("rowheader").map((cell) => cell.textContent);
    expect(rowHeaders).toEqual(["1", "2", "3"]);
  });
});

describe("DraftBoardGrid cells", () => {
  it("shows the round and pick label on an unplayed pick", () => {
    render(<DraftBoardGrid board={board()} />);
    // Seat 3's second-round pick in a 4-team snake. Round 2 runs backwards, so
    // it is the 2nd pick of the round — 2.02, not 2.03. The label is the place
    // in the round, not the column.
    expect(screen.getByText("2.02")).toBeInTheDocument();
    expect(screen.getByText("1.01")).toBeInTheDocument();
  });

  it("shows the drafted player's name in place of the label", () => {
    render(
      <DraftBoardGrid
        board={board({
          picks: withPick(1, "Bijan Robinson", "RB", "ATL"),
        })}
      />
    );

    expect(screen.getByText("Robinson")).toBeInTheDocument();
    expect(screen.getByText("Bijan")).toBeInTheDocument();
    expect(screen.getByText("ATL RB")).toBeInTheDocument();
    // The label it replaced is gone.
    expect(screen.queryByText("1.01")).not.toBeInTheDocument();
  });

  it("colors a drafted player by position, never in clock-green", () => {
    const { container } = render(
      <DraftBoardGrid
        board={board({
          picks: withPick(1, "Ja'Marr Chase", "WR", "CIN"),
        })}
      />
    );
    const chip = screen.getByText("Chase").closest("div");
    expect(chip?.className).toContain("bg-purple");
    expect(container.querySelector(".bg-green")).toBeNull();
  });

  it("marks the pick on the clock with PICKING, not a player name", () => {
    render(<DraftBoardGrid board={board({ currentPickNumber: 5 })} />);
    expect(screen.getAllByText("Picking…")).toHaveLength(1);
    // Pick 5 opens round 2 under seat 4 in a 4-team snake — labelled 2.01 —
    // so that label is replaced by the clock.
    expect(screen.queryByText("2.01")).not.toBeInTheDocument();
  });

  it("keeps a single surname on a one-word player name", () => {
    render(
      <DraftBoardGrid
        board={board({
          picks: withPick(1, "Chiefs", "DEF", "KC"),
        })}
      />
    );
    expect(screen.getByText("Chiefs")).toBeInTheDocument();
  });

  it("renders a full board of the right size", () => {
    render(<DraftBoardGrid board={board()} />);
    const rows = screen.getAllByRole("row");
    // One header row plus one row per round.
    expect(rows).toHaveLength(ROUNDS + 1);
    for (const row of rows.slice(1)) {
      expect(within(row).getAllByRole("cell")).toHaveLength(LEAGUE_SIZE);
    }
  });
});
