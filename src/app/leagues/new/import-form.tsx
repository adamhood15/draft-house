"use client";

import { useActionState, useState } from "react";
import { importLeague, lookupLeagues } from "@/lib/leagues/actions";
import { initialImportState, initialLookupState } from "@/lib/leagues/state";
import type { LookupLeague } from "@/lib/leagues/state";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function ImportForm() {
  const [lookupState, lookupAction] = useActionState(lookupLeagues, initialLookupState);
  const [importState, importAction, importPending] = useActionState(
    importLeague,
    initialImportState
  );
  // Tracks the specific `leagues` array the user dismissed via "Different
  // username", so the list stays hidden until a *new* lookup replaces it —
  // derived from render instead of an effect+setState round trip.
  const [dismissed, setDismissed] = useState<LookupLeague[] | null>(null);

  const leagues =
    lookupState.leagues && lookupState.leagues !== dismissed ? lookupState.leagues : null;

  if (leagues) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="text-sm text-ink/70">Select a league to import:</p>
          <button
            type="button"
            onClick={() => setDismissed(leagues)}
            className="text-xs font-bold text-purple underline"
          >
            Different username
          </button>
        </div>
        {leagues.map((league) => (
          <form key={league.league_id} action={importAction}>
            <input type="hidden" name="sleeperLeagueId" value={league.league_id} />
            <button
              type="submit"
              disabled={importPending}
              className="w-full rounded-md border-2 border-ink bg-white px-4 py-3 text-left text-sm transition-colors hover:bg-background disabled:cursor-not-allowed disabled:opacity-60"
            >
              <div className="font-bold">{league.name}</div>
              <div className="text-ink/60">
                {league.season} · {league.total_rosters} teams
              </div>
            </button>
          </form>
        ))}
        {importState.error && (
          <p role="alert" className="text-sm font-semibold text-pink">
            {importState.error}
          </p>
        )}
      </div>
    );
  }

  return (
    <form action={lookupAction} className="flex flex-col gap-4">
      <Input label="Sleeper Username" name="username" placeholder="adamhood" required />
      {lookupState.error && (
        <p role="alert" className="text-sm font-semibold text-pink">
          {lookupState.error}
        </p>
      )}
      <Button type="submit" className="w-full">
        Find Leagues
      </Button>
    </form>
  );
}
