import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { TeamEditForm } from "./team-edit-form";

export default async function MyTeamPage({
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
    redirect(`/login?next=/leagues/${leagueId}/team`);
  }

  const { data: team } = await supabase
    .from("teams")
    .select(
      "id, draft_house_team_name, team_image_url, custom_image_url, walk_up_song_url, updated_at"
    )
    .eq("league_id", leagueId)
    .eq("owner_id", user.id)
    .single();

  if (!team) {
    // Not their team (or they haven't claimed one yet) — the lobby is where
    // claiming/browsing happens instead.
    redirect(`/leagues/${leagueId}/lobby`);
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 p-6">
      <div className="text-center">
        <h1 className="font-display text-2xl">CUSTOMIZE YOUR TEAM</h1>
        <p className="text-sm text-ink/70">Make it yours before the draft.</p>
      </div>
      <div className="rounded-xl border-2 border-ink bg-white p-6 shadow-[5px_5px_0_var(--ink)]">
        <TeamEditForm key={team.updated_at} leagueId={leagueId} team={team} />
      </div>
      <Link
        href={`/leagues/${leagueId}/lobby`}
        className="text-center text-sm font-bold text-purple underline"
      >
        Continue to Lobby
      </Link>
    </div>
  );
}
