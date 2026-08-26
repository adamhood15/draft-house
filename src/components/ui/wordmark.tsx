/** docs/DESIGN.md §1: three rounded bars, short → tall → short, green/pink/purple, always in that order. */
export function Wordmark() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-end gap-1" aria-hidden>
        <span className="h-4 w-2 rounded-full bg-green" />
        <span className="h-6 w-2 rounded-full bg-pink" />
        <span className="h-4 w-2 rounded-full bg-purple" />
      </div>
      <span className="font-display text-xl tracking-tight">DRAFT HOUSE</span>
    </div>
  );
}
