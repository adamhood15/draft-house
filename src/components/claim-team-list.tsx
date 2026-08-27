"use client";

import { useActionState } from "react";
import { claimTeam } from "@/lib/leagues/team-actions";
import { initialClaimState } from "@/lib/leagues/state";

type UnclaimedTeam = {
  id: string;
  draft_house_team_name: string;
  team_image_url: string | null;
};

export function ClaimTeamList({
  leagueId,
  teams,
}: {
  leagueId: string;
  teams: UnclaimedTeam[];
}) {
  const action = claimTeam.bind(null, leagueId);
  const [state, formAction, pending] = useActionState(action, initialClaimState);

  return (
    <div className="flex w-full max-w-sm flex-col gap-3">
      {teams.map((team) => (
        <form key={team.id} action={formAction}>
          <input type="hidden" name="teamId" value={team.id} />
          <button
            type="submit"
            disabled={pending}
            className="flex w-full items-center gap-3 rounded-md border-2 border-ink bg-white px-4 py-3 text-left text-sm transition-colors hover:bg-background disabled:cursor-not-allowed disabled:opacity-60"
          >
            {team.team_image_url && (
              // eslint-disable-next-line @next/next/no-img-element -- external Sleeper CDN avatar, not worth next/image's remote-pattern config for a single small thumbnail
              <img
                src={team.team_image_url}
                alt=""
                className="h-8 w-8 rounded-full border-2 border-ink object-cover"
              />
            )}
            <span className="font-bold">{team.draft_house_team_name}</span>
          </button>
        </form>
      ))}
      {state.error && (
        <p role="alert" className="text-sm font-semibold text-pink">
          {state.error}
        </p>
      )}
    </div>
  );
}
