import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/lib/auth/actions";
import { getAvailableSleeperLeagues } from "@/lib/leagues/import";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/ui/wordmark";
import { AvailableLeagues } from "@/components/available-leagues";

function leagueHref(league: { id: string; draft_status: string }) {
  switch (league.draft_status) {
    // Stays "setup" until the commissioner explicitly confirms (see
    // confirmLeagueSetup), so an unfinished review naturally routes back here.
    case "setup":
      return `/leagues/${league.id}/setup`;
    case "drafting":
      return `/leagues/${league.id}/draft`;
    default:
      return `/leagues/${league.id}/lobby`;
  }
}

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let displayName: string | null = null;
  let leagues: { id: string; name: string; season: number; draft_status: string }[] = [];
  let availableLeagues: Awaited<ReturnType<typeof getAvailableSleeperLeagues>> = null;

  if (user) {
    const { data: userData } = await supabase
      .from("users")
      .select("display_name")
      .eq("id", user.id)
      .single();
    displayName = userData?.display_name ?? null;

    // RLS (leagues_select) already scopes this to leagues the user commissions
    // or has a claimed team in — no manual filter needed.
    const { data: leagueData } = await supabase
      .from("leagues")
      .select("id, name, season, draft_status")
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    leagues = leagueData ?? [];

    // Only worth checking once they've already synced at least one league —
    // otherwise "Import a League" below is the obvious next step already.
    if (leagues.length > 0) {
      availableLeagues = await getAvailableSleeperLeagues(user.id);
    }
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-16 text-center">
      <Wordmark />
      {user ? (
        <>
          <p className="text-sm text-ink/70">
            Signed in as <span className="font-bold">{displayName ?? user.id}</span>
          </p>

          {leagues.length > 0 && (
            <div className="flex w-full max-w-sm flex-col gap-3 text-left">
              <p className="text-center text-sm text-ink/70">Your leagues:</p>
              {leagues.map((league) => (
                <Link
                  key={league.id}
                  href={leagueHref(league)}
                  className="rounded-md border-2 border-ink bg-white px-4 py-3 text-sm transition-colors hover:bg-background"
                >
                  <div className="font-bold">{league.name}</div>
                  <div className="text-ink/60">
                    {league.season} · {league.draft_status}
                  </div>
                </Link>
              ))}
            </div>
          )}

          {availableLeagues && availableLeagues.length > 0 && (
            <AvailableLeagues
              leagues={availableLeagues.map((l) => ({
                league_id: l.league_id,
                name: l.name,
                season: l.season,
                total_rosters: l.total_rosters,
              }))}
            />
          )}

          <div className="flex gap-3">
            <Link
              href="/leagues/new"
              className="rounded-lg border-2 border-ink bg-green px-4 py-2 text-sm font-bold uppercase tracking-wide text-white shadow-[3px_3px_0_var(--ink)]"
            >
              Import a League
            </Link>
            <form action={signOut}>
              <Button type="submit" variant="secondary">
                Log Out
              </Button>
            </form>
          </div>
        </>
      ) : (
        <div className="flex gap-3">
          <Link
            href="/login"
            className="rounded-lg border-2 border-ink bg-background px-4 py-2 text-sm font-bold uppercase tracking-wide shadow-[3px_3px_0_var(--ink)]"
          >
            Log In
          </Link>
          <Link
            href="/signup"
            className="rounded-lg border-2 border-ink bg-green px-4 py-2 text-sm font-bold uppercase tracking-wide text-white shadow-[3px_3px_0_var(--ink)]"
          >
            Sign Up
          </Link>
        </div>
      )}
    </div>
  );
}
