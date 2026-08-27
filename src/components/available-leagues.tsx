"use client";

import { useActionState } from "react";
import { importLeague } from "@/lib/leagues/actions";
import { initialImportState } from "@/lib/leagues/state";

type AvailableLeague = {
  league_id: string;
  name: string;
  season: string;
  total_rosters: number;
};

export function AvailableLeagues({ leagues }: { leagues: AvailableLeague[] }) {
  const [state, formAction, pending] = useActionState(importLeague, initialImportState);

  return (
    <div className="flex w-full max-w-sm flex-col gap-3 text-left">
      <p className="text-center text-sm text-ink/70">Available to import from Sleeper:</p>
      {leagues.map((league) => (
        <form key={league.league_id} action={formAction}>
          <input type="hidden" name="sleeperLeagueId" value={league.league_id} />
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-md border-2 border-ink bg-white px-4 py-3 text-left text-sm transition-colors hover:bg-background disabled:cursor-not-allowed disabled:opacity-60"
          >
            <div className="font-bold">{league.name}</div>
            <div className="text-ink/60">
              {league.season} · {league.total_rosters} teams
            </div>
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
