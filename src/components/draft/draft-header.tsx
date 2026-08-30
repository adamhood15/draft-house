/**
 * Draft room header ticker — docs/DESIGN.md §9:
 * "round + pick number tag (clock-green), countdown timer in clock-green
 * Archivo Black numerals, 'ON THE CLOCK' label + team name in clock-green,
 * 'NEXT UP' ticker listing upcoming teams".
 *
 * The clock is rendered from drafts.timer_seconds and does not tick yet —
 * the server-authoritative countdown is docs/TIMER.md, still unbuilt. It is
 * shown rather than hidden so the layout it anchors is real, but nothing here
 * should be read as a live timer.
 */

function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function DraftHeader({
  round,
  pickInRound,
  timerSeconds,
  onClockTeamName,
  nextUpTeamNames,
}: {
  round: number;
  pickInRound: number;
  timerSeconds: number;
  onClockTeamName: string;
  nextUpTeamNames: string[];
}) {
  return (
    <header className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border-2 border-ink bg-white p-4 shadow-[5px_5px_0_var(--ink)]">
      <div className="flex items-center gap-4">
        <span className="font-display text-4xl leading-none text-green tabular-nums">
          {formatClock(timerSeconds)}
        </span>
        <div className="flex gap-2">
          <span className="inline-flex flex-col items-center rounded border-2 border-ink bg-green px-2.5 py-1 text-white">
            <span className="font-display text-base leading-none">{round}</span>
            <span className="text-[9px] font-bold uppercase tracking-[0.12em]">Round</span>
          </span>
          <span className="inline-flex flex-col items-center rounded border-2 border-ink bg-green px-2.5 py-1 text-white">
            <span className="font-display text-base leading-none">{pickInRound}</span>
            <span className="text-[9px] font-bold uppercase tracking-[0.12em]">Pick</span>
          </span>
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-green">
          On the clock
        </p>
        <h1 className="truncate font-display text-2xl uppercase leading-tight">
          {onClockTeamName}
        </h1>
        {nextUpTeamNames.length > 0 && (
          <p className="mt-1 truncate text-[11px] text-ink/60">
            <span className="font-bold uppercase tracking-[0.12em] text-ink/50">Next up</span>{" "}
            {nextUpTeamNames.join(" › ")}
          </p>
        )}
      </div>
    </header>
  );
}
