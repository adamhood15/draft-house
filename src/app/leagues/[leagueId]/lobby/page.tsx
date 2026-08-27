import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TeamRoster } from "@/components/team-roster";

export default async function LeagueLobbyPage({
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
    // Deliberately no `next` back to this lobby: the normal invite flow
    // (invite -> login/signup -> claim -> lobby) redirects here explicitly
    // from claimTeam after claiming, so it never goes through this branch.
    // This only fires for a bookmarked/typed lobby URL hit while logged
    // out, and landing on the leagues list instead lets someone with
    // multiple leagues choose, rather than being dropped into one.
    redirect("/login");
  }

  const { data: league } = await supabase
    .from("leagues")
    .select("name, commissioner_id, invite_token")
    .eq("id", leagueId)
    .single();

  if (!league) {
    // RLS hides this from anyone not yet a member of the league — they need
    // an invite link (/invite/{token}) to claim a team first.
    return (
      <div className="flex flex-1 items-center justify-center p-16 text-center">
        <p className="text-sm text-ink/70">
          You don&apos;t have access to this league yet — ask the commissioner for an invite
          link.
        </p>
      </div>
    );
  }

  const isCommissioner = league.commissioner_id === user.id;

  const { data: teams } = await supabase
    .from("teams")
    .select("id, draft_house_team_name, team_image_url, owner_id")
    .eq("league_id", leagueId)
    .order("draft_position", { ascending: true });

  const allTeams = teams ?? [];
  const viewerHasClaimed = allTeams.some((t) => t.owner_id === user.id);
  const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/invite/${league.invite_token}`;

  const ownerIds = allTeams.flatMap((t) => (t.owner_id ? [t.owner_id] : []));
  const ownerNames: Record<string, string> = {};
  if (ownerIds.length > 0) {
    const { data: owners } = await supabase
      .from("users")
      .select("id, display_name")
      .in("id", ownerIds);
    for (const owner of owners ?? []) {
      ownerNames[owner.id] = owner.display_name;
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 p-6">
      <div>
        <h1 className="font-display text-2xl">{league.name}</h1>
        <p className="text-sm text-ink/70">Draft lobby — coming soon.</p>
        {isCommissioner && (
          <Link
            href={`/leagues/${leagueId}/setup`}
            className="text-sm font-bold text-purple underline"
          >
            League Settings
          </Link>
        )}
      </div>

      {isCommissioner && (
        <section className="rounded-xl border-2 border-ink bg-white p-6 shadow-[5px_5px_0_var(--ink)]">
          <h2 className="mb-2 font-display text-lg">INVITE YOUR LEAGUE</h2>
          <p className="mb-2 text-sm text-ink/70">
            Share this link so teammates can create an account and claim their team.
          </p>
          <code className="block break-all rounded-md border-2 border-ink bg-background px-3 py-2 text-sm">
            {inviteUrl}
          </code>
        </section>
      )}

      <section className="rounded-xl border-2 border-ink bg-white p-6 shadow-[5px_5px_0_var(--ink)]">
        <h2 className="mb-4 font-display text-lg">TEAMS</h2>
        {!viewerHasClaimed && (
          <p className="mb-4 text-sm text-ink/70">Claim your team below to join the league.</p>
        )}
        <TeamRoster
          leagueId={leagueId}
          teams={allTeams}
          ownerNames={ownerNames}
          canClaim={!viewerHasClaimed}
        />
      </section>
    </div>
  );
}
