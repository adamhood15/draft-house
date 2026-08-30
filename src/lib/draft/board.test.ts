import { describe, expect, it } from "vitest";
import { buildDraftBoard } from "@/lib/draft/board";

/**
 * The grid behind the draft board (docs/DESIGN.md §9: team-name column
 * headers, round rows, position-colored chips, the active cell in
 * clock-green).
 *
 * Columns are *seats*, not owners. That distinction only shows up once a pick
 * has been traded: the slot stays in the column of the team that originally
 * held it — where everyone has been looking at it all draft — while the team
 * that now owns it is what the cell reports. Keying columns off the owner
 * instead would make picks jump columns mid-draft.
 *
 * Slots and the picks made in them are one table now, so these fixtures build
 * one array where they used to build two. The old pair could disagree about
 * whether a pick had happened; this shape cannot.
 */

const LEAGUE_SIZE = 8;
const ROUNDS = 13;
const TOTAL_PICKS = LEAGUE_SIZE * ROUNDS;

const TEAMS = Array.from({ length: LEAGUE_SIZE }, (_, index) => ({
  id: `team-${index + 1}`,
  draft_house_team_name: `Team ${index + 1}`,
  draft_position: index + 1,
}));

type PickRow = Parameters<typeof buildDraftBoard>[0]["picks"][number];

/** An unmade slot: the row exists from the moment the draft starts. */
function pending(pick_no: number, team_id: string): PickRow {
  return {
    pick_no,
    team_id,
    sleeper_player_id: null,
    player_name: null,
    player_position: null,
    player_nfl_team: null,
  };
}

/** Every slot assigned to the seat that owns it, as startDraft writes them. */
function picksFor(orderType: "snake" | "linear"): PickRow[] {
  const seatByPick = new Map<number, string>();
  for (let round = 1; round <= ROUNDS; round++) {
    for (let seat = 1; seat <= LEAGUE_SIZE; seat++) {
      const positionInRound = orderType === "snake" && round % 2 === 0 ? LEAGUE_SIZE - seat + 1 : seat;
      seatByPick.set((round - 1) * LEAGUE_SIZE + positionInRound, `team-${seat}`);
    }
  }
  return [...seatByPick.entries()].map(([pick_no, team_id]) => pending(pick_no, team_id));
}

/** Fills one slot in, the way submitting a pick does. */
function drafted(
  rows: PickRow[],
  pick_no: number,
  player: { name: string; position: string; nflTeam: string }
): PickRow[] {
  return rows.map((row) =>
    row.pick_no === pick_no
      ? {
          ...row,
          sleeper_player_id: `player-${pick_no}`,
          player_name: player.name,
          player_position: player.position,
          player_nfl_team: player.nflTeam,
        }
      : row
  );
}

function build(overrides: Partial<Parameters<typeof buildDraftBoard>[0]> = {}) {
  return buildDraftBoard({
    leagueSize: LEAGUE_SIZE,
    rounds: ROUNDS,
    orderType: "snake",
    teams: TEAMS,
    picks: picksFor("snake"),
    currentPickNumber: null,
    ...overrides,
  });
}

/** The cell in `round` under the column for `seat`. */
function cellAt(board: ReturnType<typeof buildDraftBoard>, round: number, seat: number) {
  const columnIndex = board.columns.findIndex((column) => column.draftPosition === seat);
  return board.rows[round - 1].cells[columnIndex];
}

describe("buildDraftBoard layout", () => {
  it("puts the first seat in the leftmost column", () => {
    const board = build();
    expect(board.columns.map((column) => column.draftPosition)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(board.columns[0]).toMatchObject({ teamId: "team-1", teamName: "Team 1" });
  });

  it("orders columns by seat even when the teams arrive shuffled", () => {
    const board = build({ teams: [...TEAMS].reverse() });
    expect(board.columns.map((column) => column.teamId)).toEqual(TEAMS.map((team) => team.id));
  });

  it("gives one row per round, in order", () => {
    const board = build();
    expect(board.rows).toHaveLength(ROUNDS);
    expect(board.rows.map((row) => row.round)).toEqual(
      Array.from({ length: ROUNDS }, (_, index) => index + 1)
    );
    expect(board.rows.every((row) => row.cells.length === LEAGUE_SIZE)).toBe(true);
  });

  it("places every pick on the board exactly once", () => {
    const board = build();
    const pickNumbers = board.rows.flatMap((row) => row.cells.map((cell) => cell?.pickNumber));
    expect(new Set(pickNumbers).size).toBe(TOTAL_PICKS);
    expect(pickNumbers.filter(Boolean)).toHaveLength(TOTAL_PICKS);
  });
});

describe("buildDraftBoard pick numbering", () => {
  it("keeps a seat in its own column as the snake reverses", () => {
    const board = build();
    // Seat 6 stays in column 6 all draft; its pick number AND its label move.
    // Round 2 runs backwards, so seat 6 picks 3rd — hence 2.03, not 2.06. The
    // label describes the pick's place in the round, not the column it sits in.
    expect(cellAt(board, 1, 6)).toMatchObject({ pickNumber: 6, label: "1.06" });
    expect(cellAt(board, 2, 6)).toMatchObject({ pickNumber: 11, label: "2.03" });
    expect(cellAt(board, 3, 6)).toMatchObject({ pickNumber: 22, label: "3.06" });
  });

  it("reads each round's labels in pick order across the row", () => {
    // The bug this pins: labels used to come from the seat, so round 2 read
    // 2.01…2.08 left-to-right while the picks in those cells ran 16…9. The
    // label and the pick number in the same cell disagreed.
    const board = build();
    const roundTwo = board.rows[1].cells;

    expect(roundTwo.map((cell) => cell!.label)).toEqual([
      "2.08", "2.07", "2.06", "2.05", "2.04", "2.03", "2.02", "2.01",
    ]);
    expect(roundTwo.map((cell) => cell!.pickNumber)).toEqual([16, 15, 14, 13, 12, 11, 10, 9]);
  });

  it("puts the turn of the snake in one column", () => {
    // 1.08 and 2.01 are consecutive picks owned by the same seat, so they sit
    // one directly above the other in the rightmost column.
    const board = build();
    expect(cellAt(board, 1, 8)).toMatchObject({ pickNumber: 8, label: "1.08" });
    expect(cellAt(board, 2, 8)).toMatchObject({ pickNumber: 9, label: "2.01" });
  });

  it("numbers a linear board straight down each column", () => {
    const board = build({ orderType: "linear", picks: picksFor("linear") });
    expect(cellAt(board, 1, 6)).toMatchObject({ pickNumber: 6 });
    expect(cellAt(board, 2, 6)).toMatchObject({ pickNumber: 14 });
    expect(cellAt(board, 2, 1)).toMatchObject({ pickNumber: 9 });
  });
});

describe("buildDraftBoard cell state", () => {
  it("shows the drafted player on a completed pick", () => {
    const board = build({
      picks: drafted(picksFor("snake"), 1, {
        name: "Bijan Robinson",
        position: "RB",
        nflTeam: "ATL",
      }),
    });

    expect(cellAt(board, 1, 1)).toMatchObject({
      state: "completed",
      player: { name: "Bijan Robinson", position: "RB", nflTeam: "ATL" },
    });
  });

  it("marks only the pick on the clock as current", () => {
    const board = build({ currentPickNumber: 11 });
    expect(cellAt(board, 2, 6)).toMatchObject({ state: "current", player: null });
    expect(cellAt(board, 2, 5)).toMatchObject({ state: "upcoming" });
    expect(
      board.rows.flatMap((row) => row.cells).filter((cell) => cell?.state === "current")
    ).toHaveLength(1);
  });

  it("treats a pick that already has a player as completed, not current", () => {
    // Defensive: drafts.current_pick_no advancing a beat behind the pick write
    // should never render a filled cell as still on the clock.
    const board = build({
      currentPickNumber: 1,
      picks: drafted(picksFor("snake"), 1, {
        name: "Ja'Marr Chase",
        position: "WR",
        nflTeam: "CIN",
      }),
    });
    expect(cellAt(board, 1, 1)?.state).toBe("completed");
  });

  it("leaves an unmade slot upcoming even though its row exists", () => {
    // Every slot has a row from the moment the draft starts, so the row's
    // existence cannot be what marks a pick made — the player is.
    const board = build();
    expect(board.rows.flatMap((row) => row.cells).every((cell) => cell?.state === "upcoming")).toBe(
      true
    );
  });
});

describe("buildDraftBoard traded picks", () => {
  it("keeps a traded pick in the original seat's column but reports the new owner", () => {
    const picks = picksFor("snake").map((row) =>
      row.pick_no === 11 ? { ...row, team_id: "team-2" } : row
    );
    const board = build({ picks });

    expect(cellAt(board, 2, 6)).toMatchObject({
      pickNumber: 11,
      ownerTeamId: "team-2",
      isTraded: true,
    });
    // Seat 2's own column is untouched by the trade.
    expect(cellAt(board, 2, 2)).toMatchObject({ ownerTeamId: "team-2", isTraded: false });
  });

  it("does not flag an untraded pick", () => {
    const board = build();
    expect(board.rows.flatMap((row) => row.cells).some((cell) => cell?.isTraded)).toBe(false);
  });

  it("renders a full preview board before the draft has written any slots", () => {
    // The lobby's "view draft board" link renders this: no draft_picks rows,
    // no clock. Everything on the board is derivable from the teams and the
    // draft's own settings, so the preview is the real layout rather than a
    // mock of it.
    const board = build({ picks: [], currentPickNumber: null });

    const cells = board.rows.flatMap((row) => row.cells);
    expect(cells).toHaveLength(TOTAL_PICKS);
    expect(cells.every((cell) => cell?.state === "upcoming")).toBe(true);
    expect(cells.every((cell) => cell?.player === null)).toBe(true);
    expect(cells.every((cell) => !cell?.isTraded)).toBe(true);
    // Each seat still owns its own picks, in the right column.
    expect(cellAt(board, 2, 6)).toMatchObject({ pickNumber: 11, ownerTeamId: "team-6" });
  });

  it("falls back to the seat's own team when a slot row is missing", () => {
    // A board row that failed to write should render as that seat's pick
    // rather than crashing the whole draft room.
    const board = build({ picks: picksFor("snake").filter((row) => row.pick_no !== 11) });
    expect(cellAt(board, 2, 6)).toMatchObject({ ownerTeamId: "team-6", isTraded: false });
  });
});
