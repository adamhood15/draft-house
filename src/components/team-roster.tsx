"use client";

import { useActionState } from "react";
import { claimTeam } from "@/lib/leagues/team-actions";
import { initialClaimState } from "@/lib/leagues/state";

type Team = {
  id: string;
  draft_house_team_name: string;
  owner_id: string | null;
};

export function TeamRoster({
  leagueId,
  teams,
  ownerNames,
  canClaim,
}: {
  leagueId: string;
  teams: Team[];
  ownerNames: Record<string, string>;
  /** Whether the viewer can claim a team here — false once they've already claimed one. */
  canClaim: boolean;
}) {
  const action = claimTeam.bind(null, leagueId);
  const [state, formAction, pending] = useActionState(action, initialClaimState);

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-2">
        {teams.map((team) => (
          <li
            key={team.id}
            className="flex items-center justify-between rounded-md border-2 border-ink px-3 py-2 text-sm"
          >
            <span className="font-bold">{team.draft_house_team_name}</span>
            {team.owner_id ? (
              <span className="text-ink/60">{ownerNames[team.owner_id] ?? "…"}</span>
            ) : canClaim ? (
              <form action={formAction}>
                <input type="hidden" name="teamId" value={team.id} />
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-md border-2 border-ink bg-green px-3 py-1 text-xs font-bold uppercase tracking-wide text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Claim
                </button>
              </form>
            ) : (
              <span className="text-ink/60">Waiting...</span>
            )}
          </li>
        ))}
      </ul>
      {state.error && (
        <p role="alert" className="text-sm font-semibold text-pink">
          {state.error}
        </p>
      )}
    </div>
  );
}
