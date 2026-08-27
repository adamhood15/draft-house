import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getLeagueByInviteToken, getUnclaimedTeams, getUserClaimedTeamId } from "@/lib/leagues/teams";
import { ClaimTeamList } from "@/components/claim-team-list";
import { Wordmark } from "@/components/ui/wordmark";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ inviteToken: string }>;
}) {
  const { inviteToken } = await params;
  const league = await getLeagueByInviteToken(inviteToken);

  if (!league) {
    notFound();
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-6 p-16 text-center">
        <Wordmark />
        <p className="text-sm text-ink/70">
          You&apos;ve been invited to join <span className="font-bold">{league.name}</span> (
          {league.season}).
        </p>
        <div className="flex gap-3">
          <Link
            href={`/login?next=/invite/${inviteToken}`}
            className="rounded-lg border-2 border-ink bg-background px-4 py-2 text-sm font-bold uppercase tracking-wide shadow-[3px_3px_0_var(--ink)]"
          >
            Log In
          </Link>
          <Link
            href={`/signup?next=/invite/${inviteToken}`}
            className="rounded-lg border-2 border-ink bg-green px-4 py-2 text-sm font-bold uppercase tracking-wide text-white shadow-[3px_3px_0_var(--ink)]"
          >
            Sign Up
          </Link>
        </div>
      </div>
    );
  }

  const alreadyClaimedTeamId = await getUserClaimedTeamId(league.id, user.id);
  if (alreadyClaimedTeamId) {
    redirect(`/leagues/${league.id}/lobby`);
  }

  const teams = await getUnclaimedTeams(league.id);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-16 text-center">
      <Wordmark />
      <div>
        <h1 className="font-display text-2xl">{league.name}</h1>
        <p className="text-sm text-ink/70">Pick your team to join the league.</p>
      </div>
      {teams.length > 0 ? (
        <ClaimTeamList leagueId={league.id} teams={teams} />
      ) : (
        <p className="text-sm text-ink/70">
          All teams in this league have already been claimed.
        </p>
      )}
    </div>
  );
}
