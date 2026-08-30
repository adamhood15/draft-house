/**
 * Maps Sleeper's draft order onto Draft House seats.
 *
 * Sleeper describes the same seating twice, with two maps that are both
 * `Record<string, number>` and keyed by completely different things. Passing
 * one where the other is expected type-checks cleanly and produces a board
 * that looks plausible and is wrong, so they are named rather than positional:
 *
 *   slot_to_roster_id  slot → roster_id, e.g. `{"1": 4, "2": 3, "3": 8}`.
 *                      Only GET /draft/<draft_id> returns it. Preferred: it
 *                      names rosters directly, so it seats a roster whose
 *                      owner_id is null — an orphan team Sleeper has
 *                      nonetheless given a slot.
 *   draft_order        user_id → slot, e.g. `{"1003848676206268416": 1}`.
 *                      On both draft endpoints, and the only one on
 *                      GET /league/<id>/drafts. Reaches a roster through
 *                      owner_id, so an unowned roster is invisible to it.
 *
 * Neither is `roster_id → slot`. roster_id is Sleeper's identifier for a team,
 * handed out at league creation and unrelated to who picks first — using it as
 * the seat is the bug this module exists to prevent.
 *
 * Deliberately dependency-free (no `@/` imports, no `server-only`) so the seed
 * script can import it directly and the two paths can't drift — this is the
 * one home for the mapping.
 *
 * Output is always a contiguous 1..N with no duplicates, which is what
 * startDraft requires before it will build a board.
 */

export type RosterSeatInput = {
  roster_id: number;
  owner_id: string | null;
};

/**
 * Where seats come from, in preference order. Both are optional: `draft_order`
 * is null until the commissioner sets the order in Sleeper, and
 * `slot_to_roster_id` is simply absent from the drafts-list endpoint.
 */
export type DraftSeatSources = {
  /** Sleeper's `slot_to_roster_id` — slot → roster_id. Wins when present. */
  slotToRosterId?: Record<string, number> | null;
  /** Sleeper's `draft_order` — user_id → slot. Used when the above is absent. */
  draftOrder?: Record<string, number> | null;
};

/** roster_id → draft_position (1..N). */
export function assignDraftPositions(
  rosters: RosterSeatInput[],
  sources: DraftSeatSources
): Map<number, number> {
  const { slotToRosterId, draftOrder } = sources;

  // slot_to_roster_id arrives keyed the wrong way for a per-roster lookup, so
  // invert it once. A roster_id appearing under two slots would make the seat
  // ambiguous; the lower slot wins, matching "first slot Sleeper listed".
  const slotByRosterId = new Map<number, number>();
  for (const [slot, rosterId] of Object.entries(slotToRosterId ?? {})) {
    const slotNumber = Number(slot);
    if (!Number.isFinite(slotNumber) || typeof rosterId !== "number") continue;
    const existing = slotByRosterId.get(rosterId);
    if (existing === undefined || slotNumber < existing) {
      slotByRosterId.set(rosterId, slotNumber);
    }
  }

  const slotFor = (roster: RosterSeatInput): number | null => {
    const fromRosterId = slotByRosterId.get(roster.roster_id);
    if (fromRosterId !== undefined) return fromRosterId;

    if (!draftOrder || !roster.owner_id) return null;
    const slot = draftOrder[roster.owner_id];
    return typeof slot === "number" ? slot : null;
  };

  // Teams Sleeper has seated, in slot order; then everyone else — an unowned
  // roster absent from both maps, or an owner missing from draft_order — after
  // them, by roster_id so the result stays stable between runs.
  const seated = rosters.filter((roster) => slotFor(roster) !== null);
  const unseated = rosters.filter((roster) => slotFor(roster) === null);

  seated.sort((a, b) => slotFor(a)! - slotFor(b)! || a.roster_id - b.roster_id);
  unseated.sort((a, b) => a.roster_id - b.roster_id);

  // Renumber rather than trusting Sleeper's raw slots: they can arrive with
  // gaps (a removed user), and a board needs 1..N exactly.
  const positions = new Map<number, number>();
  [...seated, ...unseated].forEach((roster, index) => {
    positions.set(roster.roster_id, index + 1);
  });
  return positions;
}
