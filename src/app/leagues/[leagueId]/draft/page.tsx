import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { buildDraftBoard } from "@/lib/draft/board";
import { DEFAULT_DRAFT_ORDER_TYPE, isDraftOrderType } from "@/lib/draft/order";
import { DraftBoardGrid } from "@/components/draft/draft-board";
import { DraftHeader } from "@/components/draft/draft-header";
import { LiveFeedPlaceholder } from "@/components/draft/live-feed-placeholder";

/** How many upcoming teams the "NEXT UP" ticker names (docs/DESIGN.md §9). */
const NEXT_UP_COUNT = 6;

export default async function DraftRoomPage({
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
    redirect(`/login?next=/leagues/${leagueId}/draft`);
  }

  const { data: league } = await supabase
    .from("leagues")
    .select("name, league_size")
    .eq("id", leagueId)
    .is("deleted_at", null)
    .single();

  if (!league) {
    // RLS hides leagues the viewer hasn't joined — same treatment as the lobby.
    return (
      <div className="flex flex-1 items-center justify-center p-16 text-center">
        <p className="text-sm text-ink/70">
          You don&apos;t have access to this league yet — ask the commissioner for an invite link.
        </p>
      </div>
    );
  }

  // The draft row carries both the configuration and the live clock now, so
  // one read replaces what used to be leagues + draft_settings + draft_state.
  const { data: draft } = await supabase
    .from("drafts")
    .select("id, status, type, rounds, current_pick_no, current_round, current_team_id, timer_seconds")
    .eq("league_id", leagueId)
    .single();

  // The board is derivable from the teams and the draft's own settings, so it
  // renders before the draft starts too — the lobby links here so everyone can
  // see their seat and their pick numbers while they wait. Only the live
  // chrome (clock, on-the-clock, picks) waits for startDraft.
  const isLive =
    draft?.status === "drafting" || draft?.status === "paused" || draft?.status === "complete";

  const { data: teams } = await supabase
    .from("teams")
    .select("id, draft_house_team_name, draft_position")
    .eq("league_id", leagueId)
    .order("draft_position", { ascending: true });

  // Slots and the players in them are one table, so the board needs one query
  // where it used to need two — and they can no longer disagree.
  const { data: picks } = isLive
    ? await supabase
        .from("draft_picks")
        .select("pick_no, team_id, sleeper_player_id, player_name, player_position, player_nfl_team")
        .eq("league_id", leagueId)
    : { data: null };

  // rounds comes from the draft's settings, so a league still missing them
  // would ask for a zero-round board and throw.
  if (!teams?.length || !draft || draft.rounds < 1) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-4 p-16 text-center">
        <h1 className="font-display text-2xl uppercase">{league.name}</h1>
        <p className="text-sm text-ink/70">
          There&apos;s no draft board to show yet — this league still needs its teams and roster
          settings.
        </p>
        <Link href={`/leagues/${leagueId}/lobby`} className="text-sm font-bold text-purple underline">
          Back to the lobby
        </Link>
      </div>
    );
  }

  const orderType = isDraftOrderType(draft.type) ? draft.type : DEFAULT_DRAFT_ORDER_TYPE;

  const board = buildDraftBoard({
    leagueSize: league.league_size,
    rounds: draft.rounds,
    orderType,
    teams: teams ?? [],
    picks: picks ?? [],
    currentPickNumber: isLive ? draft.current_pick_no : null,
  });

  const teamNames = new Map((teams ?? []).map((team) => [team.id, team.draft_house_team_name]));
  const cellsByPick = new Map(
    board.rows.flatMap((row) =>
      row.cells.flatMap((cell) => (cell ? ([[cell.pickNumber, cell]] as const) : []))
    )
  );

  const currentPickNumber = isLive ? draft.current_pick_no : 1;
  const currentCell = cellsByPick.get(currentPickNumber);
  const onClockTeamName =
    teamNames.get(currentCell?.ownerTeamId ?? draft.current_team_id ?? "") ?? "—";

  const nextUpTeamNames = Array.from({ length: NEXT_UP_COUNT }, (_, index) =>
    cellsByPick.get(currentPickNumber + index + 1)
  ).flatMap((cell) => {
    const name = cell ? teamNames.get(cell.ownerTeamId) : undefined;
    return name ? [name] : [];
  });

  return (
    <div className="mx-auto flex w-full max-w-[110rem] flex-col gap-4 p-4">
      {isLive ? (
        <DraftHeader
          round={currentCell?.round ?? draft.current_round}
          pickInRound={((currentPickNumber - 1) % league.league_size) + 1}
          timerSeconds={draft.timer_seconds}
          onClockTeamName={onClockTeamName}
          nextUpTeamNames={nextUpTeamNames}
        />
      ) : (
        <header className="flex flex-wrap items-center justify-between gap-4 rounded-xl border-2 border-ink bg-white p-4 shadow-[5px_5px_0_var(--ink)]">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink/50">
              Draft board preview
            </p>
            <h1 className="font-display text-2xl uppercase leading-tight">{league.name}</h1>
            <p className="mt-1 text-[11px] text-ink/60">
              {league.league_size} teams &middot; {draft.rounds} rounds &middot;{" "}
              {orderType === "snake" ? "Snake" : "Linear"} order &middot; the draft hasn&apos;t
              started yet
            </p>
          </div>
          <Link
            href={`/leagues/${leagueId}/lobby`}
            className="text-sm font-bold text-purple underline"
          >
            Back to the lobby
          </Link>
        </header>
      )}

      <DraftBoardGrid board={board} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,24rem)_1fr]">
        <LiveFeedPlaceholder />
        <div aria-hidden />
      </div>
    </div>
  );
}
