import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  expectRedirect,
  queuedFrom,
  type FromStub,
  type QueryResult,
} from "@/lib/leagues/test-helpers";

/**
 * Two defects, both in this module (CODE_REVIEW draft-house-0c):
 *
 * 1. updateTeam reads "no error" as "saved" — see settings.test.ts for the
 *    full reasoning; a zero-row update is indistinguishable from a successful
 *    one unless you ask for the rows back.
 *
 * 2. claimTeam's idempotency guard destructures only `data` and discards the
 *    error. On duplicate ownership PostgREST answers `.maybeSingle()` with
 *    PGRST116 and a null body, so "owns two teams" reads as "owns none" and
 *    the guard hands the user straight into claiming a third. It fails open,
 *    and the failure feeds itself.
 */

let serverFrom: FromStub;
let adminFrom: FromStub;
let adminFromCalls = 0;

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
    from: (...args: unknown[]) => serverFrom(...args),
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (...args: unknown[]) => {
      adminFromCalls += 1;
      return adminFrom(...args);
    },
  }),
}));
vi.mock("@/lib/storage", () => ({
  replaceTeamFile: vi.fn(),
  removeTeamFile: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { claimTeam, updateTeam } = await import("@/lib/leagues/team-actions");

const NO_ROWS_MATCHED: QueryResult = { data: [], error: null };
const NO_EXISTING_CLAIM: QueryResult = { data: null, error: null };

/** What postgrest-js synthesizes client-side for a >1-row maybeSingle. */
const DUPLICATE_CLAIM_ROWS: QueryResult = {
  data: null,
  error: {
    code: "PGRST116",
    details: "Results contain 2 rows, application/vnd.pgrst.object+json requires 1 row",
    hint: null,
    message: "JSON object requested, multiple (or no) rows returned",
  },
};

/** What Postgres returns once the partial unique index on (league_id, owner_id) lands. */
const UNIQUE_VIOLATION: QueryResult = {
  data: null,
  error: {
    code: "23505",
    details: "Key (league_id, owner_id)=(league-1, user-1) already exists.",
    hint: null,
    message: 'duplicate key value violates unique constraint "teams_one_claim_per_user"',
  },
};

function claimForm(teamId = "team-2") {
  const form = new FormData();
  form.set("teamId", teamId);
  return form;
}

function teamNameForm(name = "The Hoodlums") {
  const form = new FormData();
  form.set("name", name);
  return form;
}

beforeEach(() => {
  adminFromCalls = 0;
  serverFrom = queuedFrom([]);
  adminFrom = queuedFrom([]);
});

describe("claimTeam", () => {
  it("sends a fresh claimer to team customization", async () => {
    adminFrom = queuedFrom([NO_EXISTING_CLAIM, { data: [{ id: "team-2" }], error: null }]);
    await expectRedirect(claimTeam("league-1", { error: null }, claimForm()), "/leagues/league-1/team");
  });

  it("sends someone who already claimed a team back to the lobby", async () => {
    adminFrom = queuedFrom([{ data: { id: "team-1" }, error: null }]);
    await expectRedirect(
      claimTeam("league-1", { error: null }, claimForm()),
      "/leagues/league-1/lobby"
    );
  });

  it("does not read duplicate ownership as owning no team", async () => {
    // The guard must not fall through to the claim write here. Falling
    // through is what turns one duplicate into two.
    adminFrom = queuedFrom([DUPLICATE_CLAIM_ROWS]);
    await expectRedirect(
      claimTeam("league-1", { error: null }, claimForm()),
      "/leagues/league-1/lobby"
    );
    expect(adminFromCalls).toBe(1);
  });

  it("surfaces an unreadable claim check instead of claiming anyway", async () => {
    adminFrom = queuedFrom([{ data: null, error: { code: "08006", message: "connection failure" } }]);
    const state = await claimTeam("league-1", { error: null }, claimForm());
    expect(state.error).toBe("Couldn't check your existing teams. Please try again.");
    expect(adminFromCalls).toBe(1);
  });

  it("treats a unique violation as already having a team, not as a lost race", async () => {
    // Post-index, a double claim surfaces here rather than silently
    // succeeding. "Someone else took it" would be a false statement about
    // who owns what.
    adminFrom = queuedFrom([NO_EXISTING_CLAIM, UNIQUE_VIOLATION]);
    await expectRedirect(
      claimTeam("league-1", { error: null }, claimForm()),
      "/leagues/league-1/lobby"
    );
    // The guard above redirects to this same URL, so without pinning the call
    // count this passes whether the redirect came from the unique violation or
    // from the guard firing early. Mutation-checked: making the guard redirect
    // unconditionally leaves this test green until this line is present.
    expect(adminFromCalls).toBe(2);
  });

  it("still reports a genuinely lost race on the team itself", async () => {
    adminFrom = queuedFrom([NO_EXISTING_CLAIM, NO_ROWS_MATCHED]);
    const state = await claimTeam("league-1", { error: null }, claimForm());
    expect(state.error).toBe("That team was just claimed by someone else — pick another.");
  });

  it("does not blame another claimer for an unrelated write failure", async () => {
    adminFrom = queuedFrom([
      NO_EXISTING_CLAIM,
      { data: null, error: { code: "08006", message: "connection failure" } },
    ]);
    const state = await claimTeam("league-1", { error: null }, claimForm());
    expect(state.error).toBe("Couldn't claim that team. Please try again.");
  });
});

describe("updateTeam", () => {
  const permissionRead: QueryResult = {
    data: { id: "team-1", league_id: "league-1", owner_id: "user-1" },
    error: null,
  };

  it("reports success when the write actually matched a row", async () => {
    serverFrom = queuedFrom([permissionRead, { data: [{ id: "team-1" }], error: null }]);
    await expect(
      updateTeam("league-1", "team-1", { error: null }, teamNameForm())
    ).resolves.toEqual({ error: null });
  });

  it("does not report success when the write matched no rows", async () => {
    serverFrom = queuedFrom([permissionRead, NO_ROWS_MATCHED]);
    const state = await updateTeam("league-1", "team-1", { error: null }, teamNameForm());
    expect(state.error).toBe("Couldn't save your team — you may not have permission to edit it.");
  });
});
