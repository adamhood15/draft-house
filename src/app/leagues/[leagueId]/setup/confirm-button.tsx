"use client";

import { useActionState, useState } from "react";
import { confirmLeagueSetup } from "@/lib/leagues/settings";
import { initialSettingsState } from "@/lib/leagues/state";
import { Button } from "@/components/ui/button";

export function ConfirmButton({ leagueId }: { leagueId: string }) {
  const action = confirmLeagueSetup.bind(null, leagueId);
  const [state, formAction] = useActionState(action, initialSettingsState);
  // Moves the league to "lobby" with no way back from this page — a
  // one-click accidental submit here isn't recoverable, so require a
  // deliberate second click rather than a native confirm() dialog.
  const [armed, setArmed] = useState(false);

  return (
    <form action={formAction} className="flex flex-col items-end gap-2">
      {state.error && (
        <p role="alert" className="text-sm font-semibold text-pink">
          {state.error}
        </p>
      )}
      {armed ? (
        <div className="flex items-center gap-3">
          <p className="text-sm text-ink/70">Open the lobby now? Teams can start joining.</p>
          <button
            type="button"
            onClick={() => setArmed(false)}
            className="text-sm font-bold text-ink/70 underline"
          >
            Cancel
          </button>
          <Button type="submit">Yes, Open Lobby</Button>
        </div>
      ) : (
        <Button type="button" onClick={() => setArmed(true)}>
          Confirm &amp; Open Lobby
        </Button>
      )}
    </form>
  );
}
