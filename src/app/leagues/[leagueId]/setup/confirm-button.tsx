"use client";

import { useActionState } from "react";
import { confirmLeagueSetup } from "@/lib/leagues/settings";
import { initialSettingsState } from "@/lib/leagues/state";
import { Button } from "@/components/ui/button";

export function ConfirmButton({ leagueId }: { leagueId: string }) {
  const action = confirmLeagueSetup.bind(null, leagueId);
  const [state, formAction] = useActionState(action, initialSettingsState);

  return (
    <form action={formAction} className="flex flex-col items-end gap-2">
      {state.error && (
        <p role="alert" className="text-sm font-semibold text-pink">
          {state.error}
        </p>
      )}
      <Button type="submit">Confirm &amp; Open Lobby</Button>
    </form>
  );
}
