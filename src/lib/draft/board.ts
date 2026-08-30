import {
  draftSlotForPick,
  pickNumberForSlot,
  type DraftOrderType,
} from "@/lib/draft/order";

/**
 * Shapes the draft board grid — docs/DESIGN.md §9: team-name column headers,
 * one row per round, the active cell in clock-green.
 *
 * Pure, so the draft room can stay a server component that just renders what
 * this returns. All pick math is delegated to src/lib/draft/order.ts rather
 * than recomputed here.
 *
 * Columns are seats, not owners. The distinction is invisible until a pick is
 * traded: the slot stays in the column of the seat that originally held it,
 * and the cell reports whoever owns it now. Keying columns off the owner would
 * make picks jump columns mid-draft, under team names that never picked them.
 */

export type BoardPlayer = {
  name: string;
  position: string;
  nflTeam: string | null;
};

export type BoardCellState = "completed" | "current" | "upcoming";

export type BoardCell = {
  pickNumber: number;
  round: number;
  /** Seat this cell sits under, 1..leagueSize. */
  draftPosition: number;
  /** "2.06" — round and place in the round, per docs/DRAFT_ENGINE.md. NOT the
   *  seat: in a snake the label alternates ends while the column does not. */
  label: string;
  /** Team that owns the pick now; differs from the column after a trade. */
  ownerTeamId: string;
  isTraded: boolean;
  state: BoardCellState;
  player: BoardPlayer | null;
};

export type BoardColumn = {
  draftPosition: number;
  teamId: string;
  teamName: string;
};

export type DraftBoard = {
  columns: BoardColumn[];
  rows: { round: number; cells: (BoardCell | null)[] }[];
};

type TeamRow = {
  id: string;
  draft_house_team_name: string;
  draft_position: number;
};

/**
 * One draft_picks row. The slot and the pick made in it are the same record
 * now, so ownership and player arrive together and cannot disagree about
 * whether the pick happened — which two separate tables could.
 */
type DraftPickRow = {
  pick_no: number;
  team_id: string;
  sleeper_player_id: string | null;
  player_name: string | null;
  player_position: string | null;
  player_nfl_team: string | null;
};

export function buildDraftBoard(input: {
  leagueSize: number;
  rounds: number;
  orderType: DraftOrderType;
  teams: TeamRow[];
  picks: DraftPickRow[];
  currentPickNumber: number | null;
}): DraftBoard {
  const { leagueSize, rounds, orderType, teams, picks, currentPickNumber } = input;

  const columns: BoardColumn[] = [...teams]
    .sort((a, b) => a.draft_position - b.draft_position)
    .map((team) => ({
      draftPosition: team.draft_position,
      teamId: team.id,
      teamName: team.draft_house_team_name,
    }));

  const pickByNumber = new Map(picks.map((pick) => [pick.pick_no, pick]));

  const rows = Array.from({ length: rounds }, (_, index) => {
    const round = index + 1;

    const cells = columns.map((column) => {
      const pickNumber = pickNumberForSlot(round, column.draftPosition, leagueSize, orderType);
      const slot = draftSlotForPick(pickNumber, leagueSize, orderType);
      const pick = pickByNumber.get(pickNumber);
      // A missing draft_picks row shouldn't blank the cell — the seat that
      // owns the slot is derivable, and is right until a trade says otherwise.
      // This is also the pre-draft case: the board renders in the lobby, where
      // no rows exist yet.
      const ownerTeamId = pick?.team_id ?? column.teamId;
      // The player is what makes a cell completed, not the row's status: a
      // row exists for every slot from the moment the draft starts.
      const player = pick?.player_name
        ? {
            name: pick.player_name,
            position: pick.player_position ?? "",
            nflTeam: pick.player_nfl_team,
          }
        : null;

      return {
        pickNumber,
        round,
        draftPosition: column.draftPosition,
        label: slot.label,
        ownerTeamId,
        isTraded: ownerTeamId !== column.teamId,
        // A cell with a player is completed even if the clock still points at
        // it: drafts.current_pick_no can lag the pick write by a beat, and
        // rendering a filled cell as "PICKING…" would read as the pick coming
        // undone.
        state: player ? "completed" : pickNumber === currentPickNumber ? "current" : "upcoming",
        player,
      } satisfies BoardCell;
    });

    return { round, cells };
  });

  return { columns, rows };
}
