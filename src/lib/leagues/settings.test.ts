import { beforeEach, describe, expect, it, vi } from "vitest";
import { queuedFrom, type FromStub, type QueryResult } from "@/lib/leagues/test-helpers";

/**
 * A Supabase update that matches zero rows answers `{ error: null }` — byte
 * for byte the same answer a successful write gives. RLS filtering the row
 * out and the id not existing both land there. So an action that reads "no
 * error" as "saved" reports success for a write that never happened, and the
 * form clears as if it had.
 *
 * The correct shape already exists in this same module: confirmLeagueSetup
 * appends `.select("id")` and checks `data.length === 0`. These tests hold
 * the other two writes to it.
 */

let from: FromStub;

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: (...args: unknown[]) => from(...args) }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { updateLeagueSettings, updateDraftSettings } = await import("@/lib/leagues/settings");

const NO_ROWS_MATCHED: QueryResult = { data: [], error: null };
const ONE_ROW_MATCHED: QueryResult = { data: [{ id: "league-1" }], error: null };

function leagueForm() {
  const form = new FormData();
  form.set("name", "The Hood Invitational");
  form.set("scoring_format", "ppr");
  form.set("position_QB", "1");
  form.set("position_RB", "2");
  return form;
}

function draftForm() {
  const form = new FormData();
  form.set("seconds_per_pick", "90");
  form.set("timer_enabled", "on");
  form.set("draft_start_time", "2026-09-01T19:00");
  return form;
}

beforeEach(() => {
  from = queuedFrom([]);
});

describe("updateLeagueSettings", () => {
  it("reports success when the write actually matched a row", async () => {
    from = queuedFrom([ONE_ROW_MATCHED]);
    await expect(updateLeagueSettings("league-1", { error: null }, leagueForm())).resolves.toEqual({
      error: null,
    });
  });

  it("does not report success when the write matched no rows", async () => {
    from = queuedFrom([NO_ROWS_MATCHED]);
    const state = await updateLeagueSettings("league-1", { error: null }, leagueForm());
    expect(state.error).toBe(
      "Couldn't save league settings — you may not have permission to edit this league."
    );
  });
});

describe("updateDraftSettings", () => {
  it("reports success when both writes matched a row", async () => {
    from = queuedFrom([ONE_ROW_MATCHED, ONE_ROW_MATCHED]);
    await expect(updateDraftSettings("league-1", { error: null }, draftForm())).resolves.toEqual({
      error: null,
    });
  });

  it("does not report success when the draft_settings write matched no rows", async () => {
    from = queuedFrom([NO_ROWS_MATCHED]);
    const state = await updateDraftSettings("league-1", { error: null }, draftForm());
    expect(state.error).toBe(
      "Couldn't save draft settings — you may not have permission to edit this league."
    );
  });

  it("reports the half-succeeded save honestly when only the start time fails", async () => {
    // Two tables, written sequentially, with no transaction spanning them.
    // Saying "failed" would be as wrong as saying "saved" — the pick timer
    // really did change, and a commissioner who retries needs to know which
    // half to look at.
    from = queuedFrom([ONE_ROW_MATCHED, NO_ROWS_MATCHED]);
    const state = await updateDraftSettings("league-1", { error: null }, draftForm());
    expect(state.error).toBe(
      "Draft settings saved, but the start time didn't — you may not have permission to edit this league."
    );
  });
});
