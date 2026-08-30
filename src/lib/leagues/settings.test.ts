import { beforeEach, describe, expect, it, vi } from "vitest";
import { queryBuilder, queuedFrom, type FromStub, type QueryResult } from "@/lib/leagues/test-helpers";

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
  form.set("draft_format", "snake");
  return form;
}

/**
 * queuedFrom, plus a record of every payload handed to `.update()`.
 *
 * The draft order is the first setting whose *value* has to be asserted and
 * not merely its success: writing the wrong column, or dropping the field on
 * the way to the second table, still answers ONE_ROW_MATCHED and would sail
 * past every other test in this file.
 */
function capturingFrom(results: QueryResult[], updates: unknown[]): FromStub {
  const pending = [...results];
  return () => {
    const chain = queryBuilder(pending.shift() ?? { data: [], error: null }) as Record<
      string,
      unknown
    >;
    const passThrough = chain.update as () => unknown;
    chain.update = (payload: unknown) => {
      updates.push(payload);
      return passThrough();
    };
    return chain;
  };
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
  it("reports success when the write actually matched a row", async () => {
    from = queuedFrom([ONE_ROW_MATCHED]);
    await expect(updateDraftSettings("league-1", { error: null }, draftForm())).resolves.toEqual({
      error: null,
    });
  });

  it("does not report success when the write matched no rows", async () => {
    from = queuedFrom([NO_ROWS_MATCHED]);
    const state = await updateDraftSettings("league-1", { error: null }, draftForm());
    expect(state.error).toBe(
      "Couldn't save draft settings — you may not have permission to edit this league."
    );
  });

  it("saves every draft setting in a single write", async () => {
    // This used to be two sequential updates — draft_settings then leagues —
    // with no transaction spanning them, so the pick timer could save while
    // the draft order didn't, and the action had to report a half-applied save
    // in its own error message. Consolidating onto `drafts` made that state
    // unreachable, and one write is the property that keeps it unreachable.
    const updates: unknown[] = [];
    from = capturingFrom([ONE_ROW_MATCHED], updates);

    await updateDraftSettings("league-1", { error: null }, draftForm());

    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      pick_timer: 90,
      type: "snake",
      allow_pick_trading: false,
      start_time: new Date("2026-09-01T19:00").toISOString(),
    });
  });
});

describe("updateDraftSettings timer", () => {
  /**
   * There is no timer_enabled column any more. "No timer" is pick_timer = 0 —
   * Sleeper's own convention — so the checkbox and the seconds input collapse
   * into one value on the way to the database. Two columns could contradict
   * each other; one cannot.
   */
  it("writes an unchecked timer as pick_timer 0, not as the seconds still in the box", async () => {
    const updates: unknown[] = [];
    from = capturingFrom([ONE_ROW_MATCHED], updates);

    const form = draftForm();
    form.delete("timer_enabled");
    await updateDraftSettings("league-1", { error: null }, form);

    expect(updates[0]).toMatchObject({ pick_timer: 0 });
  });

  it("accepts an unchecked timer even when the seconds field is below the floor", async () => {
    // The 10s floor is about what a commissioner may type into a live clock.
    // With the clock off the value is discarded, so rejecting the save would
    // block a legitimate setting on the strength of an ignored input.
    const updates: unknown[] = [];
    from = capturingFrom([ONE_ROW_MATCHED], updates);

    const form = draftForm();
    form.delete("timer_enabled");
    form.set("seconds_per_pick", "3");
    const state = await updateDraftSettings("league-1", { error: null }, form);

    expect(state.error).toBeNull();
    expect(updates[0]).toMatchObject({ pick_timer: 0 });
  });

  it("still enforces the floor when the timer is on", async () => {
    const updates: unknown[] = [];
    from = capturingFrom([ONE_ROW_MATCHED], updates);

    const form = draftForm();
    form.set("seconds_per_pick", "3");
    const state = await updateDraftSettings("league-1", { error: null }, form);

    expect(state.error).toBe("Seconds per pick must be at least 10.");
    expect(updates).toEqual([]);
  });
});

describe("updateDraftSettings draft order", () => {
  it("writes the chosen order onto the draft", async () => {
    const updates: unknown[] = [];
    from = capturingFrom([ONE_ROW_MATCHED], updates);

    const form = draftForm();
    form.set("draft_format", "linear");
    await expect(updateDraftSettings("league-1", { error: null }, form)).resolves.toEqual({
      error: null,
    });

    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ type: "linear" });
  });

  it("keeps snake when snake is what was chosen", async () => {
    const updates: unknown[] = [];
    from = capturingFrom([ONE_ROW_MATCHED], updates);
    await updateDraftSettings("league-1", { error: null }, draftForm());
    expect(updates[0]).toMatchObject({ type: "snake" });
  });

  it.each(["auction", "SNAKE", "", "linearr"])(
    "refuses %o rather than writing it to the league",
    async (posted) => {
      const updates: unknown[] = [];
      from = capturingFrom([ONE_ROW_MATCHED], updates);

      const form = draftForm();
      form.set("draft_format", posted);
      const state = await updateDraftSettings("league-1", { error: null }, form);

      expect(state.error).toBe("Invalid draft order.");
      // Rejected before the table is touched at all.
      expect(updates).toEqual([]);
    }
  );

  it("refuses a request that omits the order entirely", async () => {
    const updates: unknown[] = [];
    from = capturingFrom([ONE_ROW_MATCHED], updates);

    const form = draftForm();
    form.delete("draft_format");
    const state = await updateDraftSettings("league-1", { error: null }, form);

    expect(state.error).toBe("Invalid draft order.");
    expect(updates).toEqual([]);
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
