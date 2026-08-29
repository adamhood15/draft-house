import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LeagueSettingsForm } from "./league-settings-form";
import { DraftSettingsForm } from "./draft-settings-form";
import { ConfirmButton } from "./confirm-button";

// Setup runs in two steps: league settings, then draft settings. The step
// lives in the URL rather than in client state so a refresh, the back button,
// and a link reopened on another device all land on the same step — and so the
// page stays a server component.
const STEPS = [
  { key: "league", label: "League Settings" },
  { key: "draft", label: "Draft Settings" },
] as const;

function StepHeader({ current }: { current: "league" | "draft" }) {
  const currentIndex = STEPS.findIndex((s) => s.key === current);

  return (
    <ol className="flex items-center gap-3">
      {STEPS.map((step, i) => {
        const state = i === currentIndex ? "current" : i < currentIndex ? "done" : "upcoming";
        return (
          <li key={step.key} className="flex items-center gap-3">
            <span
              aria-current={state === "current" ? "step" : undefined}
              className={`flex items-center gap-2 text-sm font-bold uppercase tracking-wide ${
                state === "upcoming" ? "text-ink/40" : "text-ink"
              }`}
            >
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full border-2 border-ink text-xs ${
                  state === "current" ? "bg-green text-white" : "bg-white text-ink"
                } ${state === "upcoming" ? "opacity-40" : ""}`}
              >
                {i + 1}
              </span>
              {step.label}
            </span>
            {i < STEPS.length - 1 && <span aria-hidden className="h-0.5 w-6 bg-ink/30" />}
          </li>
        );
      })}
    </ol>
  );
}

export default async function LeagueSetupPage({
  params,
  searchParams,
}: {
  params: Promise<{ leagueId: string }>;
  searchParams: Promise<{ step?: string; saved?: string }>;
}) {
  const { leagueId } = await params;
  const { step, saved } = await searchParams;
  const currentStep = step === "draft" ? "draft" : "league";
  // saveDraftSettings redirects here with saved=1 rather than returning success
  // state, so the confirmation is rendered from the URL — it survives the
  // remount that a set_updated_at trigger would otherwise cause.
  const justSaved = saved === "1";
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
    .select("seconds_per_pick, timer_enabled, allow_pick_trading, updated_at")
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
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="font-display text-2xl">{league.name}</h1>
          <p className="text-sm text-ink/70">
            {currentStep === "league"
              ? "Review the settings imported from Sleeper, then continue to the draft setup."
              : "Set how the draft itself runs, then open the lobby to your league."}
          </p>
        </div>
        <StepHeader current={currentStep} />
      </div>

      {currentStep === "league" ? (
        <section className="rounded-xl border-2 border-ink bg-white p-6 shadow-[5px_5px_0_var(--ink)]">
          <h2 className="mb-4 font-display text-lg">LEAGUE SETTINGS</h2>
          <LeagueSettingsForm key={league.updated_at} league={league} />
        </section>
      ) : (
        <>
          <section className="rounded-xl border-2 border-ink bg-white p-6 shadow-[5px_5px_0_var(--ink)]">
            <div className="mb-4 flex items-baseline justify-between gap-4">
              <h2 className="font-display text-lg">DRAFT SETTINGS</h2>
              {justSaved && (
                <p role="status" className="text-sm font-bold text-green">
                  Saved
                </p>
              )}
            </div>
            {/* Deliberately unkeyed. draft_settings has a set_updated_at
                trigger, so keying this on updated_at remounted the form on
                every successful save — which reset useActionState and threw
                away the "Saved" confirmation before it could render. The
                inputs already hold what was just written, so there is nothing
                to re-sync. */}
            <DraftSettingsForm
              leagueId={leagueId}
              draftSettings={draftSettings}
              draftStartTimeLocal={draftStartTimeLocal}
            />
          </section>

          <Link
            href={`/leagues/${leagueId}/setup?step=league`}
            className="self-start text-sm font-bold text-ink/70 underline"
          >
            &larr; Back to League Settings
          </Link>

          {league.draft_status === "setup" ? (
            <ConfirmButton leagueId={leagueId} />
          ) : (
            <p className="text-right text-sm text-ink/70">
              This league is already in the {league.draft_status} phase.
            </p>
          )}
        </>
      )}
    </div>
  );
}
