import type { BoardCell, DraftBoard } from "@/lib/draft/board";
import { positionColor } from "@/components/ui/position-tag";

/**
 * The draft board — docs/DESIGN.md §9: "team-name column headers,
 * position-colored player chips inside each round row, the active cell shown
 * in clock-green with 'PICKING…'".
 *
 * Presentational only. buildDraftBoard (src/lib/draft/board.ts) decides what
 * belongs in each cell; this decides how it looks.
 *
 * The signature 5px hard offset shadow (§5) is on the board card itself and on
 * the active cell, not on all 100+ cells — at board density the shadows stack
 * into noise and stop reading as elevation. Cells keep the 2px ink border that
 * carries the rest of the house style.
 */

function splitName(name: string): { first: string; last: string } {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return { first: "", last: parts[0] };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

function CompletedCell({ cell }: { cell: BoardCell }) {
  const { first, last } = splitName(cell.player!.name);

  return (
    <div
      className={`flex h-full flex-col justify-between rounded-md border-2 border-ink px-2 py-1.5 ${positionColor(
        cell.player!.position
      )}`}
    >
      <div className="flex items-baseline justify-between gap-1">
        <span className="truncate text-[10px] font-bold uppercase tracking-wide opacity-80">
          {first}
        </span>
        <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide opacity-80">
          {cell.player!.nflTeam ?? ""} {cell.player!.position}
        </span>
      </div>
      <span className="truncate font-display text-[13px] uppercase leading-tight">{last}</span>
    </div>
  );
}

function CurrentCell() {
  return (
    // Clock-green, reserved exclusively for the active pick (§3).
    <div className="flex h-full items-center justify-center gap-1.5 rounded-md border-2 border-green bg-white shadow-[3px_3px_0_var(--green)]">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green" aria-hidden />
      <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-green">
        Picking…
      </span>
    </div>
  );
}

function UpcomingCell({ cell }: { cell: BoardCell }) {
  return (
    <div className="flex h-full items-start rounded-md border-2 border-ink/10 bg-ink/[0.03] px-2 py-1.5">
      <span className="text-[11px] font-semibold tabular-nums text-ink/35">{cell.label}</span>
    </div>
  );
}

export function DraftBoardGrid({ board }: { board: DraftBoard }) {
  return (
    <div className="overflow-x-auto rounded-xl border-2 border-ink bg-white shadow-[5px_5px_0_var(--ink)]">
      <table className="w-full min-w-[64rem] border-collapse">
        <caption className="sr-only">
          Draft board: one column per team in draft order, one row per round.
        </caption>
        <thead>
          <tr className="border-b-2 border-ink">
            <th
              scope="col"
              className="w-10 px-2 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-ink/60"
            >
              RD
            </th>
            {board.columns.map((column) => (
              <th
                key={column.teamId}
                scope="col"
                className="border-l-2 border-ink/10 px-2 py-2 text-center font-display text-[11px] uppercase tracking-wide"
              >
                <span className="block truncate" title={column.teamName}>
                  {column.teamName}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {board.rows.map((row) => (
            <tr key={row.round} className="border-b-2 border-ink/10 last:border-b-0">
              <th
                scope="row"
                className="px-2 text-center font-display text-[13px] text-ink/70 tabular-nums"
              >
                {row.round}
              </th>
              {row.cells.map((cell, index) => (
                <td
                  key={cell?.pickNumber ?? `${row.round}-${index}`}
                  className="h-14 border-l-2 border-ink/10 p-1 align-top"
                >
                  {cell === null ? null : cell.state === "completed" ? (
                    <CompletedCell cell={cell} />
                  ) : cell.state === "current" ? (
                    <CurrentCell />
                  ) : (
                    <UpcomingCell cell={cell} />
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
