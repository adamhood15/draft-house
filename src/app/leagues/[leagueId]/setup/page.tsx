import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LeagueSettingsForm } from "./league-settings-form";
import { DraftSettingsForm } from "./draft-settings-form";
import { ConfirmButton } from "./confirm-button";

export default async function LeagueSetupPage({
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
    redirect(`/login?next=/leagues/${leagueId}/setup`);
  }

  const { data: league } = await supabase
    .from("leagues")
    .select(
      "id, commissioner_id, name, season, league_size, scoring_format, positions, draft_status, draft_start_time, updated_at"
    )
    .eq("id", leagueId)
    .is("deleted_at", null)
    .single();

  if (!league) {
    notFound();
  }

  if (league.commissioner_id !== user.id) {
    return (
      <div className="flex flex-1 items-center justify-center p-16 text-center">
        <p className="text-sm text-ink/70">
          Only {league.name}&apos;s commissioner can review its setup.
        </p>
      </div>
    );
  }

  const { data: draftSettings } = await supabase
    .from("draft_settings")
    .select("seconds_per_pick, allow_pick_trading, updated_at")
    .eq("league_id", leagueId)
    .single();

  if (!draftSettings) {
    notFound();
  }

  const draftStartTimeLocal = league.draft_start_time
    ? new Date(league.draft_start_time).toISOString().slice(0, 16)
    : "";

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 p-6">
      <div>
        <h1 className="font-display text-2xl">{league.name}</h1>
        <p className="text-sm text-ink/70">
          Review the settings imported from Sleeper before inviting your league.
        </p>
      </div>

      <section className="rounded-xl border-2 border-ink bg-white p-6 shadow-[5px_5px_0_var(--ink)]">
        <h2 className="mb-4 font-display text-lg">LEAGUE SETTINGS</h2>
        <LeagueSettingsForm key={league.updated_at} league={league} />
      </section>

      <section className="rounded-xl border-2 border-ink bg-white p-6 shadow-[5px_5px_0_var(--ink)]">
        <h2 className="mb-4 font-display text-lg">DRAFT SETTINGS</h2>
        <DraftSettingsForm
          key={`${draftSettings.updated_at}-${league.updated_at}`}
          leagueId={leagueId}
          draftSettings={draftSettings}
          draftStartTimeLocal={draftStartTimeLocal}
        />
      </section>

      {league.draft_status === "setup" ? (
        <ConfirmButton leagueId={leagueId} />
      ) : (
        <p className="text-right text-sm text-ink/70">
          This league is already in the {league.draft_status} phase.
        </p>
      )}
    </div>
  );
}
