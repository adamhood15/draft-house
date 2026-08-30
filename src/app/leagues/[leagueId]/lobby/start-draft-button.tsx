"use client";

import { useActionState, useState } from "react";
import { startDraft } from "@/lib/draft/start";
import { initialDraftStartState } from "@/lib/draft/state";
import { Button } from "@/components/ui/button";

export function StartDraftButton({
  leagueId,
  unclaimedTeams,
}: {
  leagueId: string;
  unclaimedTeams: number;
}) {
  const action = startDraft.bind(null, leagueId);
  const [state, formAction] = useActionState(action, initialDraftStartState);
  // Starting writes the whole board and moves the league out of the lobby,
  // with no undo on this page. Same two-click arming as ConfirmButton rather
  // than a native confirm(), which would block the page.
  const [armed, setArmed] = useState(false);

  return (
    <form action={formAction} className="flex flex-col items-end gap-2">
      {state.error && (
        <p role="alert" className="text-sm font-semibold text-pink">
          {state.error}
        </p>
      )}
      {armed ? (
        <div className="flex flex-wrap items-center justify-end gap-3">
          <p className="text-sm text-ink/70">
            Start the draft now?
            {unclaimedTeams > 0 &&
              ` ${unclaimedTeams} ${unclaimedTeams === 1 ? "team hasn't" : "teams haven't"} claimed a seat yet.`}
          </p>
          <button
            type="button"
            onClick={() => setArmed(false)}
            className="text-sm font-bold text-ink/70 underline"
          >
            Cancel
          </button>
          <Button type="submit">Yes, Start Draft</Button>
        </div>
      ) : (
        <Button type="button" onClick={() => setArmed(true)}>
          Start Draft
        </Button>
      )}
    </form>
  );
}
