/**
 * Position chip — docs/DESIGN.md §3 and §6.
 *
 * The colors here are fixed and semantic ("QB pink, RB blue, WR purple, TE
 * gold, DEF teal, K orange, FLEX gray, BENCH outline. Never reassign."), and
 * green is deliberately absent: it is reserved for the on-the-clock state so
 * the active pick can never collide with a roster color.
 *
 * One home for the mapping, so the board, rosters, player search and the
 * activity feed can't drift into coloring the same position differently.
 */

export const POSITION_COLORS: Record<string, string> = {
  QB: "bg-pink text-white",
  RB: "bg-blue text-white",
  WR: "bg-purple text-white",
  TE: "bg-gold text-ink",
  DEF: "bg-teal text-white",
  DST: "bg-teal text-white",
  K: "bg-orange text-white",
  FLEX: "bg-flex-gray text-white",
  // Bench is outlined rather than filled — it isn't an active roster slot, so
  // it should read as "off" (§3).
  BN: "bg-white text-ink",
  BENCH: "bg-white text-ink",
};

/** Anything unrecognized reads as neutral rather than borrowing another position's color. */
export const UNKNOWN_POSITION_COLOR = "bg-flex-gray text-white";

export function positionColor(position: string | null | undefined): string {
  if (!position) return UNKNOWN_POSITION_COLOR;
  return POSITION_COLORS[position.toUpperCase()] ?? UNKNOWN_POSITION_COLOR;
}

export function PositionTag({
  position,
  className = "",
}: {
  position: string | null | undefined;
  className?: string;
}) {
  const label = (position ?? "—").toUpperCase();

  return (
    <span
      // Pill, 3px/9px padding, bold 10-11px text (§6 Badges & Tags).
      className={`inline-flex items-center rounded border-2 border-ink px-[9px] py-[3px] text-[10px] font-bold leading-none ${positionColor(position)} ${className}`}
    >
      {label}
    </span>
  );
}
