"use client";

import { useActionState } from "react";
import { updateDraftSettings } from "@/lib/leagues/settings";
import { initialSettingsState } from "@/lib/leagues/state";
import { Input } from "@/components/ui/input";
import { Toggle } from "@/components/ui/toggle";
import { Button } from "@/components/ui/button";

type DraftSettings = {
  seconds_per_pick: number;
  allow_pick_trading: boolean;
};

export function DraftSettingsForm({
  leagueId,
  draftSettings,
  draftStartTimeLocal,
}: {
  leagueId: string;
  draftSettings: DraftSettings;
  draftStartTimeLocal: string;
}) {
  const action = updateDraftSettings.bind(null, leagueId);
  const [state, formAction] = useActionState(action, initialSettingsState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Input
        label="Seconds Per Pick"
        name="seconds_per_pick"
        type="number"
        min={10}
        defaultValue={draftSettings.seconds_per_pick}
        required
      />
      <Input
        label="Draft Start Time (optional)"
        name="draft_start_time"
        type="datetime-local"
        defaultValue={draftStartTimeLocal}
      />
      <Toggle
        name="allow_pick_trading"
        label="Allow Pick Trading"
        defaultChecked={draftSettings.allow_pick_trading}
      />
      {state.error && (
        <p role="alert" className="text-sm font-semibold text-pink">
          {state.error}
        </p>
      )}
      <Button type="submit" className="self-start">
        Save Draft Settings
      </Button>
    </form>
  );
}
