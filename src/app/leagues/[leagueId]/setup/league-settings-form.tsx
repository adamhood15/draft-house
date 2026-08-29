"use client";

import { useActionState } from "react";
import { saveLeagueSettingsAndContinue } from "@/lib/leagues/settings";
import { initialSettingsState } from "@/lib/leagues/state";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

type League = {
  id: string;
  name: string;
  season: number;
  league_size: number;
  scoring_format: string;
  positions: Record<string, number>;
};

export function LeagueSettingsForm({ league }: { league: League }) {
  // Advancing to step two is the action's job, not this component's — it
  // redirects server-side only when the write actually matched a row.
  const action = saveLeagueSettingsAndContinue.bind(null, league.id);
  const [state, formAction] = useActionState(action, initialSettingsState);
  const positionEntries = Object.entries(league.positions);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Input label="League Name" name="name" defaultValue={league.name} required />

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-bold uppercase tracking-wide text-ink/80">
            Season
          </span>
          <span className="text-sm">{league.season}</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-bold uppercase tracking-wide text-ink/80">Teams</span>
          <span className="text-sm">{league.league_size}</span>
        </div>
      </div>

      <Select label="Scoring Format" name="scoring_format" defaultValue={league.scoring_format}>
        <option value="std">Standard</option>
        <option value="half_ppr">Half PPR</option>
        <option value="ppr">PPR</option>
      </Select>

      <div>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-ink/80">
          Roster Construction
        </p>
        <div className="grid grid-cols-4 gap-3">
          {positionEntries.map(([pos, count]) => (
            <label key={pos} className="flex flex-col gap-1">
              <span className="text-xs font-bold">{pos}</span>
              <input
                type="number"
                name={`position_${pos}`}
                defaultValue={count}
                min={0}
                className="rounded-md border-2 border-ink bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-green focus:ring-offset-2 focus:ring-offset-background"
              />
            </label>
          ))}
        </div>
      </div>

      {state.error && (
        <p role="alert" className="text-sm font-semibold text-pink">
          {state.error}
        </p>
      )}
      <Button type="submit" className="self-start">
        Save &amp; Continue
      </Button>
    </form>
  );
}
