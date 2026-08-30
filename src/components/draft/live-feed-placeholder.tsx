/**
 * Placeholder for the live chat/activity feed — docs/DESIGN.md §6
 * "Toggle & Live Feed": a dark streamer-style panel (ink background, white
 * text) with a LIVE pill and compact stacked rows.
 *
 * Deliberately static. The real feed is docs/CHAT.md + docs/REALTIME.md and
 * needs chat_messages, reactions and a realtime subscription, none of which
 * exist yet. This holds its corner of the draft room layout with sample rows
 * so the composition is real; every name below is invented.
 */

const SAMPLE_ROWS = [
  { kind: "pick", text: "Pick 3 — Royals are on the clock" },
  { kind: "chat", author: "Mike", text: "WHAT ARE YOU DOING" },
  { kind: "chat", author: "Priya", text: "that's my guy 😤" },
] as const;

export function LiveFeedPlaceholder() {
  return (
    <section
      aria-label="Live feed (coming soon)"
      className="flex h-full min-h-[12rem] flex-col gap-2 rounded-xl border-2 border-ink bg-ink p-4 text-white shadow-[5px_5px_0_var(--ink)]"
    >
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-pink px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em]">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" aria-hidden />
          Live
        </span>
        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/40">
          Sample
        </span>
      </div>

      <ul className="flex flex-col gap-1.5">
        {SAMPLE_ROWS.map((row, index) => (
          <li key={index} className="text-[12px] leading-snug text-white/70">
            {row.kind === "chat" ? (
              <>
                <span className="font-bold text-white">{row.author}:</span> {row.text}
              </>
            ) : (
              <span className="font-bold text-white">{row.text}</span>
            )}
          </li>
        ))}
      </ul>

      <p className="mt-auto text-[10px] uppercase tracking-[0.12em] text-white/30">
        Chat and reactions land here
      </p>
    </section>
  );
}
