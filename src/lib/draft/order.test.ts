import { describe, expect, it } from "vitest";
import {
  DRAFT_ORDER_TYPES,
  type DraftOrderType,
  draftSlotForPick,
  formatPickLabel,
  generateDraftOrder,
  isDraftOrderType,
  pickNumberForSlot,
  totalPicks,
} from "@/lib/draft/order";

/**
 * Pick order math, per docs/DRAFT_ENGINE.md#implementation.
 *
 * Two numbers are easy to conflate and mean different things, so every case
 * below pins both:
 *   - draftPosition — the seat that owns the pick, fixed for the whole draft
 *     and taken from where the team sat in round one. Matches
 *     teams.draft_position.
 *   - positionInRound — where the pick falls in that round's *sequence*.
 *     Equal to draftPosition in a linear draft; mirrored on even rounds in a
 *     snake.
 * The display label is built from positionInRound, not the seat: "2.03" means
 * the third pick of round two, which is what it means everywhere else in
 * fantasy football. So a team's label moves between rounds in a snake — seat 1
 * in an 8-team league reads 1.01, 2.08, 3.01, 4.08 — and that is correct.
 */

const ORDER_TYPES = Object.keys(DRAFT_ORDER_TYPES) as DraftOrderType[];

describe("DRAFT_ORDER_TYPES", () => {
  it("offers snake and linear", () => {
    expect(ORDER_TYPES).toEqual(["snake", "linear"]);
    expect(DRAFT_ORDER_TYPES.snake.label).toBe("Snake");
    expect(DRAFT_ORDER_TYPES.linear.label).toBe("Linear");
  });

  it("gives every type a label and a description for the settings form", () => {
    for (const type of ORDER_TYPES) {
      expect(DRAFT_ORDER_TYPES[type].label).toBeTruthy();
      expect(DRAFT_ORDER_TYPES[type].description).toBeTruthy();
    }
  });
});

describe("isDraftOrderType", () => {
  it("accepts every registered type", () => {
    for (const type of ORDER_TYPES) {
      expect(isDraftOrderType(type)).toBe(true);
    }
  });

  it("rejects anything else a form could post", () => {
    // The settings form posts a string; this is the server-side gate on it.
    expect(isDraftOrderType("auction")).toBe(false);
    expect(isDraftOrderType("SNAKE")).toBe(false);
    expect(isDraftOrderType("")).toBe(false);
    expect(isDraftOrderType(undefined)).toBe(false);
    expect(isDraftOrderType(null)).toBe(false);
    expect(isDraftOrderType(3)).toBe(false);
  });
});

describe("snake order", () => {
  it("runs a 12-team first round ascending", () => {
    expect(draftSlotForPick(1, 12, "snake")).toEqual({
      pickNumber: 1,
      round: 1,
      positionInRound: 1,
      draftPosition: 1,
      label: "1.01",
    });
    expect(draftSlotForPick(12, 12, "snake")).toMatchObject({
      round: 1,
      positionInRound: 12,
      draftPosition: 12,
      label: "1.12",
    });
  });

  it("reverses the second round so the last seat picks back-to-back", () => {
    // Picks 12 and 13 are both seat 12 — the turn of the snake.
    expect(draftSlotForPick(13, 12, "snake")).toEqual({
      pickNumber: 13,
      round: 2,
      positionInRound: 1,
      draftPosition: 12,
      // The FIRST pick of round two, so 2.01 — even though seat 12 owns it.
      // Labelling by seat would call this "2.12" and put the last label of the
      // round on its first pick.
      label: "2.01",
    });
    expect(draftSlotForPick(24, 12, "snake")).toMatchObject({
      round: 2,
      positionInRound: 12,
      draftPosition: 1,
      label: "2.12",
    });
  });

  it("returns to ascending on the third round", () => {
    expect(draftSlotForPick(25, 12, "snake")).toMatchObject({ round: 3, draftPosition: 1 });
    expect(draftSlotForPick(36, 12, "snake")).toMatchObject({ round: 3, draftPosition: 12 });
  });

  it("snakes an odd league size", () => {
    expect(draftSlotForPick(11, 11, "snake")).toMatchObject({ round: 1, draftPosition: 11 });
    expect(draftSlotForPick(12, 11, "snake")).toMatchObject({ round: 2, draftPosition: 11 });
    expect(draftSlotForPick(22, 11, "snake")).toMatchObject({ round: 2, draftPosition: 1 });
  });

  it("locates a seat's pick in both directions of the snake", () => {
    expect(pickNumberForSlot(1, 1, 12, "snake")).toBe(1);
    expect(pickNumberForSlot(2, 12, 12, "snake")).toBe(13);
    expect(pickNumberForSlot(2, 1, 12, "snake")).toBe(24);
    expect(pickNumberForSlot(3, 1, 12, "snake")).toBe(25);
  });
});

describe("snake labels", () => {
  /**
   * The label has to agree with the pick number in the same cell. Labelling by
   * seat did not: in an 8-team snake the cell reading "2.01" held pick #16 —
   * the LAST pick of the round — while "2.08" held pick #9, the first. Half
   * the board was backwards, and nothing failed, because every label was a
   * plausible-looking `round.NN`.
   */

  it("alternates a seat's label between the ends of the round", () => {
    // The case a manager actually notices: holding 1.01 in an 8-team snake
    // means holding 2.08, 3.01, 4.08 — the turn, every round.
    const seatOne = [1, 2, 3, 4, 5, 6].map(
      (round) => draftSlotForPick(pickNumberForSlot(round, 1, 8, "snake"), 8, "snake").label
    );

    expect(seatOne).toEqual(["1.01", "2.08", "3.01", "4.08", "5.01", "6.08"]);
  });

  it("numbers each round's labels in the order the picks are actually made", () => {
    // Picks 9..16 are round two, in sequence. Their labels must count up even
    // though the seats that own them count down.
    const roundTwo = [9, 10, 11, 12, 13, 14, 15, 16].map((pick) =>
      draftSlotForPick(pick, 8, "snake")
    );

    expect(roundTwo.map((slot) => slot.label)).toEqual([
      "2.01", "2.02", "2.03", "2.04", "2.05", "2.06", "2.07", "2.08",
    ]);
    // ...and those seats really do run backwards.
    expect(roundTwo.map((slot) => slot.draftPosition)).toEqual([8, 7, 6, 5, 4, 3, 2, 1]);
  });

  it("keeps the turn of the snake in one seat", () => {
    // Pick 8 ends round one and pick 9 opens round two; both belong to seat 8,
    // which is what makes them sit in the same column, one above the other.
    const eighth = draftSlotForPick(8, 8, "snake");
    const ninth = draftSlotForPick(9, 8, "snake");

    expect(eighth).toMatchObject({ draftPosition: 8, label: "1.08" });
    expect(ninth).toMatchObject({ draftPosition: 8, label: "2.01" });
  });

  it("leaves a linear draft's labels equal to its seats", () => {
    // Nothing mirrors, so label and seat agree in every round — which is why
    // the seat-based bug was invisible in linear leagues.
    for (const pick of [1, 8, 9, 16, 17]) {
      const slot = draftSlotForPick(pick, 8, "linear");
      expect(slot.label).toBe(formatPickLabel(slot.round, slot.draftPosition));
    }
  });
});

describe("linear order", () => {
  it("runs every round in the same direction", () => {
    expect(draftSlotForPick(1, 8, "linear")).toMatchObject({
      round: 1,
      positionInRound: 1,
      draftPosition: 1,
      label: "1.01",
    });
    // Pick 9 opens round two — and in a linear draft seat 1 opens it again,
    // where a snake would hand it to seat 8.
    expect(draftSlotForPick(9, 8, "linear")).toMatchObject({
      round: 2,
      positionInRound: 1,
      draftPosition: 1,
      label: "2.01",
    });
    expect(draftSlotForPick(16, 8, "linear")).toMatchObject({
      round: 2,
      positionInRound: 8,
      draftPosition: 8,
      label: "2.08",
    });
  });

  it("keeps position in round equal to draft position in every round", () => {
    for (const slot of generateDraftOrder(8, 13, "linear")) {
      expect(slot.positionInRound).toBe(slot.draftPosition);
    }
  });

  it("gives draft position 6 a pick every 8th slot", () => {
    const seatSixPicks = generateDraftOrder(8, 13, "linear")
      .filter((slot) => slot.draftPosition === 6)
      .map((slot) => slot.pickNumber);

    expect(seatSixPicks).toEqual([6, 14, 22, 30, 38, 46, 54, 62, 70, 78, 86, 94, 102]);
  });
});

describe("an 8-team, 13-round snake board", () => {
  const LEAGUE_SIZE = 8;
  const ROUNDS = 13;

  it("has 104 slots", () => {
    expect(totalPicks(LEAGUE_SIZE, ROUNDS)).toBe(104);
  });

  it("keeps a team's draft position fixed while its position in round alternates", () => {
    // Seat 6 is seat 6 for the whole draft — draft position is the team's
    // identity, taken from where it sits in round one. Where that seat falls
    // in the round's *sequence* is what flips: 6th on the way out, 3rd on the
    // way back.
    expect(draftSlotForPick(6, LEAGUE_SIZE, "snake")).toMatchObject({
      round: 1,
      draftPosition: 6,
      positionInRound: 6,
    });
    expect(draftSlotForPick(11, LEAGUE_SIZE, "snake")).toMatchObject({
      round: 2,
      draftPosition: 6,
      positionInRound: 3,
    });
    expect(draftSlotForPick(22, LEAGUE_SIZE, "snake")).toMatchObject({
      round: 3,
      draftPosition: 6,
      positionInRound: 6,
    });
  });

  it("gives draft position 6 the pick numbers that seed its draft_picks rows", () => {
    const seatSixPicks = generateDraftOrder(LEAGUE_SIZE, ROUNDS, "snake")
      .filter((slot) => slot.draftPosition === 6)
      .map((slot) => slot.pickNumber);

    expect(seatSixPicks).toEqual([6, 11, 22, 27, 38, 43, 54, 59, 70, 75, 86, 91, 102]);
  });
});

describe("every registered order type", () => {
  const LEAGUE_SIZE = 8;
  const ROUNDS = 13;
  const TOTAL_PICKS = LEAGUE_SIZE * ROUNDS;
  const SEATS = Array.from({ length: LEAGUE_SIZE }, (_, index) => index + 1);

  it.each(ORDER_TYPES)("%s fills every slot, one per seat per round", (type) => {
    const board = generateDraftOrder(LEAGUE_SIZE, ROUNDS, type);
    const picksPerSeat = new Map<number, number>();
    for (const slot of board) {
      picksPerSeat.set(slot.draftPosition, (picksPerSeat.get(slot.draftPosition) ?? 0) + 1);
    }

    expect(board).toHaveLength(TOTAL_PICKS);
    expect(new Set(board.map((slot) => slot.pickNumber)).size).toBe(TOTAL_PICKS);
    expect([...picksPerSeat.keys()].sort((a, b) => a - b)).toEqual(SEATS);
    expect([...picksPerSeat.values()]).toEqual(Array(LEAGUE_SIZE).fill(ROUNDS));
  });

  it.each(ORDER_TYPES)("%s emits slots in pick order", (type) => {
    const board = generateDraftOrder(LEAGUE_SIZE, ROUNDS, type);
    expect(board.map((slot) => slot.pickNumber)).toEqual(
      Array.from({ length: TOTAL_PICKS }, (_, index) => index + 1)
    );
  });

  /**
   * pickNumberForSlot reuses each type's single seat mapping to invert it,
   * which only holds because both registered mappings are their own inverse.
   * A future order type that isn't self-inverse must supply the reverse
   * direction rather than silently returning wrong pick numbers — this is the
   * test that catches it at the moment it's added.
   */
  it.each(ORDER_TYPES)("%s inverts cleanly between slot and pick number", (type) => {
    for (let pickNumber = 1; pickNumber <= totalPicks(LEAGUE_SIZE, ROUNDS); pickNumber++) {
      const slot = draftSlotForPick(pickNumber, LEAGUE_SIZE, type);
      expect(pickNumberForSlot(slot.round, slot.draftPosition, LEAGUE_SIZE, type)).toBe(pickNumber);
    }
  });

  it.each(ORDER_TYPES)("%s rejects inputs that cannot describe a slot", (type) => {
    expect(() => draftSlotForPick(0, 12, type)).toThrow();
    expect(() => draftSlotForPick(-1, 12, type)).toThrow();
    expect(() => draftSlotForPick(1.5, 12, type)).toThrow();
    expect(() => draftSlotForPick(1, 0, type)).toThrow();
    expect(() => draftSlotForPick(1, 2.5, type)).toThrow();
    expect(() => pickNumberForSlot(0, 1, 12, type)).toThrow();
    expect(() => pickNumberForSlot(1, 0, 12, type)).toThrow();
    expect(() => pickNumberForSlot(1, 13, 12, type)).toThrow();
  });
});

describe("totalPicks", () => {
  it("multiplies seats by rounds", () => {
    expect(totalPicks(12, 16)).toBe(192);
    expect(totalPicks(10, 14)).toBe(140);
  });

  it("rejects a board with no picks in it", () => {
    expect(() => totalPicks(0, 16)).toThrow();
    expect(() => totalPicks(12, 0)).toThrow();
  });
});

describe("formatPickLabel", () => {
  it("pads the position to two digits so labels sort and align", () => {
    expect(formatPickLabel(1, 1)).toBe("1.01");
    expect(formatPickLabel(2, 12)).toBe("2.12");
    expect(formatPickLabel(16, 7)).toBe("16.07");
  });
});
