"use client";

import { useActionState, useState } from "react";
import { saveDraftSettings } from "@/lib/leagues/settings";
import { initialSettingsState } from "@/lib/leagues/state";
import { Input } from "@/components/ui/input";
import { Toggle } from "@/components/ui/toggle";
import { Button } from "@/components/ui/button";

type DraftSettings = {
  seconds_per_pick: number;
  timer_enabled: boolean;
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
  const action = saveDraftSettings.bind(null, leagueId);
  const [state, formAction] = useActionState(action, initialSettingsState);
  const [timerEnabled, setTimerEnabled] = useState(draftSettings.timer_enabled);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Toggle
        name="timer_enabled"
        label="Use a Pick Timer"
        checked={timerEnabled}
        onChange={setTimerEnabled}
      />
      <div>
        <div className={!timerEnabled ? "opacity-50" : undefined}>
          <Input
            label="Seconds Per Pick"
            name="seconds_per_pick"
            type="number"
            min={10}
            defaultValue={draftSettings.seconds_per_pick}
            readOnly={!timerEnabled}
            required
          />
        </div>
        {/* Always rendered (visibility toggled, not mounted/unmounted) so
            saving doesn't shift page layout — a real bug found in testing:
            the shift moved "Confirm & Open Lobby" under the cursor right
            after a Save click, causing an accidental confirm. */}
        <p className={`mt-1 text-xs text-ink/60 ${timerEnabled ? "invisible" : ""}`}>
          Timer is off — teams get unlimited time per pick. You can still turn it on anytime
          during the draft.
        </p>
      </div>
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
