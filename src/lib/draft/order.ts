/**
 * Draft pick order — the one home for the round/seat/pick-number math, across
 * every order type the commissioner can choose.
 *
 * Per docs/DRAFT_ENGINE.md#implementation, this is calculated in the
 * application rather than in SQL. Board generation at draft load, advancing
 * the clock after a pick, rebuilding state after an undo, and naming a pick in
 * a trade all need the same answer, so they all import from here.
 *
 * Two numbers are easy to conflate and mean different things:
 *
 *   draftPosition    the seat that owns the pick (1..N), fixed for the whole
 *                    draft and taken from where the team sat in round one.
 *                    Matches teams.draft_position. This is the team's
 *                    identity — it never moves, whatever the order type.
 *   positionInRound  where the pick falls in that round's *sequence* (1..N).
 *                    The `position_in_round` column on team_pick_assignments
 *                    and picks. Equal to draftPosition in a linear draft;
 *                    mirrored on even rounds in a snake, so a seat-6 team in
 *                    an 8-team snake is 6th out and 3rd back.
 *
 * Only draftPosition identifies a team. The display label is built from it,
 * which is why a team always reads as `round.<its own seat>`.
 *
 * Nothing here touches pick *ownership*. Slots are immutable for the life of
 * the draft; a traded pick moves team_pick_assignments.current_owner_team_id
 * and leaves this math alone (docs/TRADES.md).
 */

export type DraftOrderTypeDefinition = {
  /** Shown in the draft settings select. */
  label: string;
  /** One line under the select explaining what the order does. */
  description: string;
  /**
   * Maps a round's sequence position to the seat that owns it.
   *
   * Must be its own inverse — pickNumberForSlot runs it in reverse to turn a
   * seat back into a sequence position, rather than each type having to
   * supply two functions that could drift apart. Both registered types
   * satisfy this (identity, and a mirror). A future type that does not must
   * grow an explicit reverse direction; the "inverts cleanly" test in
   * order.test.ts runs over every registered type and fails the moment one
   * is added that breaks the property.
   */
  seatForPosition: (positionInRound: number, round: number, leagueSize: number) => number;
};

export const DRAFT_ORDER_TYPES = {
  snake: {
    label: "Snake",
    description:
      "Order reverses every round — the last team to pick in a round picks first in the next.",
    // Odd rounds run 1→N, even rounds N→1. Mirroring the sequence position is
    // the whole of the snake.
    seatForPosition: (positionInRound, round, leagueSize) =>
      round % 2 === 1 ? positionInRound : leagueSize - positionInRound + 1,
  },
  linear: {
    label: "Linear",
    description: "Same order every round — draft position 1 picks first in all of them.",
    seatForPosition: (positionInRound) => positionInRound,
  },
} as const satisfies Record<string, DraftOrderTypeDefinition>;

export type DraftOrderType = keyof typeof DRAFT_ORDER_TYPES;

/** What a league drafts as unless the commissioner changes it (leagues.draft_format default). */
export const DEFAULT_DRAFT_ORDER_TYPE: DraftOrderType = "snake";

/**
 * Server-side gate on the draft settings form, which posts an arbitrary
 * string. Also narrows leagues.draft_format, which the database types as a
 * bare `text`.
 */
export function isDraftOrderType(value: unknown): value is DraftOrderType {
  return (
    typeof value === "string" && Object.prototype.hasOwnProperty.call(DRAFT_ORDER_TYPES, value)
  );
}

export type DraftSlot = {
  /** Global 1-indexed pick number, 1..totalPicks. */
  pickNumber: number;
  /** 1-indexed round. */
  round: number;
  /** Place in the round's pick sequence, 1..leagueSize. */
  positionInRound: number;
  /** Seat that owns the slot, 1..leagueSize. Matches teams.draft_position. */
  draftPosition: number;
  /** Display label, `round.seat` — "1.01", "2.12". */
  label: string;
};

function assertCount(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer, received ${value}.`);
  }
}

function definitionFor(orderType: DraftOrderType): DraftOrderTypeDefinition {
  const definition = DRAFT_ORDER_TYPES[orderType];
  if (!definition) {
    // Reachable despite the type: leagues.draft_format is `text`, so a row
    // written before an order type was retired still reaches this call.
    throw new Error(`Unknown draft order type "${orderType}".`);
  }
  return definition;
}

/** Display label for a pick, `round.seat` with the seat padded to two digits. */
export function formatPickLabel(round: number, draftPosition: number): string {
  return `${round}.${String(draftPosition).padStart(2, "0")}`;
}

/** Total slots on the board — every seat picks in every round. */
export function totalPicks(leagueSize: number, rounds: number): number {
  assertCount(leagueSize, "leagueSize");
  assertCount(rounds, "rounds");
  return leagueSize * rounds;
}

/** The slot a global pick number lands on. */
export function draftSlotForPick(
  pickNumber: number,
  leagueSize: number,
  orderType: DraftOrderType
): DraftSlot {
  assertCount(pickNumber, "pickNumber");
  assertCount(leagueSize, "leagueSize");
  const { seatForPosition } = definitionFor(orderType);

  const round = Math.ceil(pickNumber / leagueSize);
  const positionInRound = ((pickNumber - 1) % leagueSize) + 1;
  const draftPosition = seatForPosition(positionInRound, round, leagueSize);

  return {
    pickNumber,
    round,
    positionInRound,
    draftPosition,
    label: formatPickLabel(round, draftPosition),
  };
}

/** The global pick number a seat holds in a given round. Inverse of draftSlotForPick. */
export function pickNumberForSlot(
  round: number,
  draftPosition: number,
  leagueSize: number,
  orderType: DraftOrderType
): number {
  assertCount(round, "round");
  assertCount(draftPosition, "draftPosition");
  assertCount(leagueSize, "leagueSize");
  if (draftPosition > leagueSize) {
    throw new Error(`draftPosition ${draftPosition} is outside a ${leagueSize}-team league.`);
  }
  const { seatForPosition } = definitionFor(orderType);

  // Run the seat mapping in reverse — see the involution note on
  // DraftOrderTypeDefinition.seatForPosition.
  const positionInRound = seatForPosition(draftPosition, round, leagueSize);
  return (round - 1) * leagueSize + positionInRound;
}

/**
 * Every slot on the board, in pick order — the source for the draft_board and
 * team_pick_assignments rows written at draft load.
 */
export function generateDraftOrder(
  leagueSize: number,
  rounds: number,
  orderType: DraftOrderType
): DraftSlot[] {
  return Array.from({ length: totalPicks(leagueSize, rounds) }, (_, index) =>
    draftSlotForPick(index + 1, leagueSize, orderType)
  );
}
