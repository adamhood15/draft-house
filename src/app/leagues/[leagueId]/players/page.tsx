import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getPlayerPool } from "@/lib/players/query";
import { rankPlayers } from "@/lib/players/rankings";
import { PlayerRankings } from "@/components/players/player-rankings";

/**
 * The player rankings board, reached from the draft room header.
 *
 * A route rather than a modal: the board is dense enough to want the full
 * width, and a URL means it survives a refresh and can be opened in a second
 * tab beside the draft. Read-only — see the note in player-rankings.tsx.
 */
export default async function PlayerRankingsPage({
  params,
}: {
  params: Promise<{ leagueId: string }>;
}) {
  const { leagueId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=/leagues/${leagueId}/players`);
  }

  const { data: league } = await supabase
    .from("leagues")
    .select("name, season, scoring_format, positions")
    .eq("id", leagueId)
    .is("deleted_at", null)
    .single();

  if (!league) {
    // RLS hides leagues the viewer hasn't joined — same treatment as the
    // draft room and the lobby.
    return (
      <div className="flex flex-1 items-center justify-center p-16 text-center">
        <p className="text-sm text-ink/70">
          You don&apos;t have access to this league yet — ask the commissioner for an invite link.
        </p>
      </div>
    );
  }

  const pool = await getPlayerPool({
    leagueId,
    season: league.season,
    scoringFormat: league.scoring_format,
    positions: league.positions,
  });
  const players = rankPlayers(pool);

  return (
    <div className="mx-auto flex w-full max-w-[90rem] flex-col gap-4 p-4">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink/50">
            {league.name}
          </p>
          <h1 className="font-display text-2xl uppercase leading-tight">Player Rankings</h1>
        </div>
        <Link
          href={`/leagues/${leagueId}/draft`}
          className="flex items-center gap-1.5 rounded-lg border-2 border-ink bg-white px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide shadow-[3px_3px_0_var(--ink)]"
        >
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.4} aria-hidden />
          Draft board
        </Link>
      </header>

      {players.length === 0 ? (
        // Not a generic "nothing here". An empty rankings board looks broken,
        // and the reason is specific and fixable, so it says which one.
        <div className="rounded-xl border-2 border-ink bg-white p-10 text-center shadow-[5px_5px_0_var(--ink)]">
          <h2 className="font-display text-lg uppercase">No players yet</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm text-ink/70">
            The player cache is empty. Rankings come from two syncs that have not been built yet —
            Sleeper&apos;s player list into <code className="font-mono text-[12px]">players</code>,
            and Dynasty Dealer&apos;s values into{" "}
            <code className="font-mono text-[12px]">player_values</code>. This board will fill in on
            its own once they run.
          </p>
        </div>
      ) : (
        <>
          <PlayerRankings players={players} />
          {/* Required by Dynasty Dealer's licence: their values are free to use
              on the one condition that this link is visible wherever the values
              appear. See the header of the player_values migration. */}
          <p className="text-[11px] text-ink/50">
            Values by{" "}
            <a
              href="https://www.dynastydealer.com"
              target="_blank"
              rel="noreferrer noopener"
              className="font-bold underline"
            >
              Dynasty Dealer
            </a>
          </p>
        </>
      )}
    </div>
  );
}
