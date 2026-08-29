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

const redirect = vi.fn();
vi.mock("next/navigation", () => ({ redirect: (...args: unknown[]) => redirect(...args) }));

const {
  updateLeagueSettings,
  updateDraftSettings,
  saveLeagueSettingsAndContinue,
  saveDraftSettings,
} = await import("@/lib/leagues/settings");

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
  redirect.mockClear();
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

describe("saveLeagueSettingsAndContinue", () => {
  /**
   * Step one of setup advances on save, so the advance has to be tied to the
   * write actually landing. A refused write surfaces as a returned `{ error }`
   * rather than a throw (see updateLeagueSettings above), so advancing on
   * "the action returned" would carry the commissioner to step two with their
   * edits silently dropped.
   */
  it("moves on to the draft step once the write has landed", async () => {
    from = queuedFrom([ONE_ROW_MATCHED]);
    await saveLeagueSettingsAndContinue("league-1", { error: null }, leagueForm());
    expect(redirect).toHaveBeenCalledWith("/leagues/league-1/setup?step=draft");
  });

  it("stays on the league step, reporting the error, when the write was refused", async () => {
    from = queuedFrom([NO_ROWS_MATCHED]);
    const state = await saveLeagueSettingsAndContinue("league-1", { error: null }, leagueForm());
    expect(state?.error).toBe(
      "Couldn't save league settings — you may not have permission to edit this league."
    );
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe("saveDraftSettings", () => {
  /**
   * Returning state from this action leaves Next's dev renderer re-rendering
   * the page in-place, which spins on setImmediate until its async-hooks Map
   * overflows ("RangeError: Map maximum size exceeded") — a 34s POST against
   * a 607ms GET of the very same page, with database writes measured at well
   * under a second. Redirecting instead keeps the save on the plain
   * POST-redirect-GET path that step one already uses, and gives the
   * confirmation somewhere to live that a remount cannot wipe.
   */
  it("redirects back to the draft step, flagged saved, once both writes landed", async () => {
    from = queuedFrom([ONE_ROW_MATCHED, ONE_ROW_MATCHED]);
    await saveDraftSettings("league-1", { error: null }, draftForm());
    expect(redirect).toHaveBeenCalledWith("/leagues/league-1/setup?step=draft&saved=1");
  });

  it("reports the error and does not redirect when the write was refused", async () => {
    from = queuedFrom([NO_ROWS_MATCHED]);
    const state = await saveDraftSettings("league-1", { error: null }, draftForm());
    expect(state?.error).toBe(
      "Couldn't save draft settings — you may not have permission to edit this league."
    );
    expect(redirect).not.toHaveBeenCalled();
  });
});
