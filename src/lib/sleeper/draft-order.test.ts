import { describe, expect, it } from "vitest";
import { assignDraftPositions } from "@/lib/sleeper/draft-order";

/**
 * Draft seats come from Sleeper, via one of two maps: `slot_to_roster_id`
 * (slot → roster_id, only on GET /draft/<draft_id>) or `draft_order`
 * (user_id → slot, on both draft endpoints).
 *
 * The bug this replaces used `roster.roster_id` as the seat. roster_id is just
 * Sleeper's identifier for a team — assigned at league creation and unrelated
 * to who picks first — so the board was showing a plausible-looking order that
 * was simply wrong, with no error anywhere to notice.
 *
 * Every result must be a contiguous 1..N with no duplicates, because
 * startDraft refuses to build a board otherwise (and would be right to).
 */

const ROSTERS = [
  { roster_id: 3, owner_id: "user-c" },
  { roster_id: 1, owner_id: "user-a" },
  { roster_id: 2, owner_id: "user-b" },
];

function seats(result: ReturnType<typeof assignDraftPositions>) {
  return [...result.entries()].sort((a, b) => a[1] - b[1]).map(([rosterId]) => rosterId);
}

describe("assignDraftPositions", () => {
  it("seats teams by Sleeper's draft_order, not by roster_id", () => {
    const result = assignDraftPositions(ROSTERS, {
      draftOrder: { "user-c": 1, "user-a": 2, "user-b": 3 },
    });
    expect(seats(result)).toEqual([3, 1, 2]);
    expect(result.get(3)).toBe(1);
  });

  it("seats teams by slot_to_roster_id when Sleeper provides it", () => {
    const result = assignDraftPositions(ROSTERS, {
      slotToRosterId: { "1": 3, "2": 1, "3": 2 },
    });
    expect(seats(result)).toEqual([3, 1, 2]);
    expect(result.get(3)).toBe(1);
  });

  it("prefers slot_to_roster_id over draft_order when both are present", () => {
    // The two disagree here only to prove which one wins; on a real draft they
    // describe the same seating.
    const result = assignDraftPositions(ROSTERS, {
      slotToRosterId: { "1": 3, "2": 1, "3": 2 },
      draftOrder: { "user-a": 1, "user-b": 2, "user-c": 3 },
    });
    expect(seats(result)).toEqual([3, 1, 2]);
  });

  it("seats an unowned roster that slot_to_roster_id gives a slot", () => {
    // The reason slot_to_roster_id is preferred: draft_order is keyed by
    // user_id, so an orphan team can never appear in it, and falls to the back
    // of the board. slot_to_roster_id names the roster directly.
    const rosters = [
      { roster_id: 1, owner_id: "user-a" },
      { roster_id: 2, owner_id: null },
      { roster_id: 3, owner_id: "user-c" },
    ];
    const result = assignDraftPositions(rosters, {
      slotToRosterId: { "1": 2, "2": 3, "3": 1 },
      draftOrder: { "user-c": 2, "user-a": 3 },
    });
    expect(result.get(2)).toBe(1);
    expect(seats(result)).toEqual([2, 3, 1]);
  });

  it("reproduces the real league's order from draft_order", () => {
    // Straight from GET /league/1357756813482684416/drafts.
    const rosters = [
      { roster_id: 1, owner_id: "302158134363844608" }, // BREEVAN
      { roster_id: 2, owner_id: "965704282244808704" }, // MrCleanjr
      { roster_id: 3, owner_id: "994491888084303872" }, // 318Hoodlum
      { roster_id: 4, owner_id: "1003848676206268416" }, // khood2
      { roster_id: 5, owner_id: "301543890408718336" }, // Stephen184
      { roster_id: 6, owner_id: "985952555911995392" }, // mmeganhoodd
      { roster_id: 7, owner_id: "304813343556788224" }, // adamhood15
      { roster_id: 8, owner_id: "301537341015601152" }, // brw17
    ];
    const draftOrder = {
      "1003848676206268416": 1,
      "301537341015601152": 3,
      "301543890408718336": 4,
      "302158134363844608": 7,
      "304813343556788224": 6,
      "965704282244808704": 5,
      "985952555911995392": 8,
      "994491888084303872": 2,
    };

    const result = assignDraftPositions(rosters, { draftOrder });
    // khood2 picks first, BREEVAN seventh — not first, as roster_id implied.
    expect(result.get(4)).toBe(1);
    expect(result.get(1)).toBe(7);
    expect(seats(result)).toEqual([4, 3, 8, 5, 2, 7, 1, 6]);
  });

  it("agrees with draft_order on the real league's slot_to_roster_id", () => {
    // Both maps straight from GET /draft/1357756813503664128. They describe the
    // same board, so the seating must not depend on which one is supplied.
    const rosters = [
      { roster_id: 1, owner_id: "302158134363844608" },
      { roster_id: 2, owner_id: "965704282244808704" },
      { roster_id: 3, owner_id: "994491888084303872" },
      { roster_id: 4, owner_id: "1003848676206268416" },
      { roster_id: 5, owner_id: "301543890408718336" },
      { roster_id: 6, owner_id: "985952555911995392" },
      { roster_id: 7, owner_id: "304813343556788224" },
      { roster_id: 8, owner_id: "301537341015601152" },
    ];
    const slotToRosterId = { "1": 4, "2": 3, "3": 8, "4": 5, "5": 2, "6": 7, "7": 1, "8": 6 };
    const draftOrder = {
      "1003848676206268416": 1,
      "301537341015601152": 3,
      "301543890408718336": 4,
      "302158134363844608": 7,
      "304813343556788224": 6,
      "965704282244808704": 5,
      "985952555911995392": 8,
      "994491888084303872": 2,
    };

    expect(seats(assignDraftPositions(rosters, { slotToRosterId }))).toEqual(
      seats(assignDraftPositions(rosters, { draftOrder }))
    );
    expect(assignDraftPositions(rosters, { slotToRosterId }).get(4)).toBe(1);
  });

  it("always returns a contiguous 1..N with no duplicates", () => {
    const cases: (Record<string, number> | null)[] = [
      null,
      {},
      { "user-a": 1, "user-b": 2, "user-c": 3 },
      // Sleeper slots with a gap, e.g. after a user was removed.
      { "user-a": 2, "user-b": 5, "user-c": 9 },
    ];
    for (const draftOrder of cases) {
      const result = assignDraftPositions(ROSTERS, { draftOrder });
      expect([...result.values()].sort((a, b) => a - b)).toEqual([1, 2, 3]);
      expect(result.size).toBe(ROSTERS.length);
    }
  });

  it("returns a contiguous 1..N from a gapped slot_to_roster_id", () => {
    const result = assignDraftPositions(ROSTERS, { slotToRosterId: { "2": 3, "5": 1, "9": 2 } });
    expect(seats(result)).toEqual([3, 1, 2]);
    expect([...result.values()].sort((a, b) => a - b)).toEqual([1, 2, 3]);
  });

  it("preserves relative order when Sleeper's slots have gaps", () => {
    const result = assignDraftPositions(ROSTERS, {
      draftOrder: { "user-a": 2, "user-b": 5, "user-c": 9 },
    });
    expect(seats(result)).toEqual([1, 2, 3]);
  });

  it("falls back to roster_id order when the draft order isn't set yet", () => {
    // draft_order is null until the commissioner sets it in Sleeper. That is
    // an ordinary pre-draft state, not an error — seats have to come from
    // somewhere, and roster_id at least gives a stable, repeatable board.
    expect(seats(assignDraftPositions(ROSTERS, { draftOrder: null }))).toEqual([1, 2, 3]);
    expect(seats(assignDraftPositions(ROSTERS, { draftOrder: undefined }))).toEqual([1, 2, 3]);
    expect(seats(assignDraftPositions(ROSTERS, { draftOrder: {} }))).toEqual([1, 2, 3]);
    expect(seats(assignDraftPositions(ROSTERS, {}))).toEqual([1, 2, 3]);
    expect(seats(assignDraftPositions(ROSTERS, { slotToRosterId: null }))).toEqual([1, 2, 3]);
  });

  it("seats an unowned roster after the teams that have a slot", () => {
    // An orphan team has no owner_id, so it can't appear in draft_order — and
    // with no slot_to_roster_id to name it, it goes to the back.
    const rosters = [...ROSTERS, { roster_id: 4, owner_id: null }];
    const result = assignDraftPositions(rosters, {
      draftOrder: { "user-c": 1, "user-a": 2, "user-b": 3 },
    });
    expect(result.get(4)).toBe(4);
    expect([...result.values()].sort((a, b) => a - b)).toEqual([1, 2, 3, 4]);
  });

  it("ignores a draft_order entry that has no roster in this league", () => {
    const result = assignDraftPositions(ROSTERS, {
      draftOrder: { "user-a": 1, "user-gone": 2, "user-b": 3, "user-c": 4 },
    });
    expect(seats(result)).toEqual([1, 2, 3]);
    expect([...result.values()].sort((a, b) => a - b)).toEqual([1, 2, 3]);
  });

  it("ignores a slot_to_roster_id entry that has no roster in this league", () => {
    const result = assignDraftPositions(ROSTERS, {
      slotToRosterId: { "1": 3, "2": 99, "3": 1, "4": 2 },
    });
    expect(seats(result)).toEqual([3, 1, 2]);
    expect([...result.values()].sort((a, b) => a - b)).toEqual([1, 2, 3]);
  });

  it("falls back to draft_order for a roster slot_to_roster_id omits", () => {
    const result = assignDraftPositions(ROSTERS, {
      slotToRosterId: { "1": 3 },
      draftOrder: { "user-a": 2, "user-b": 3 },
    });
    expect(seats(result)).toEqual([3, 1, 2]);
  });

  it("handles an empty league without throwing", () => {
    expect(assignDraftPositions([], { draftOrder: { "user-a": 1 } }).size).toBe(0);
  });
});
