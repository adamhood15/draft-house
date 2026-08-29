import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Guards the application half of the partial unique index on
 * teams (league_id, owner_id) where owner_id is not null.
 *
 * The index itself is a property of Postgres and cannot be asserted from this
 * suite — see the QA handoff on the schema-verification pass. What *can* be
 * asserted, and is the part that stays broken whether or not the index lands,
 * is how this module behaves when the constraint is violated: PostgREST
 * answers a `.maybeSingle()` over duplicate rows with PGRST116 and a null
 * body, so a caller that destructures only `data` reads "owns two teams" as
 * "owns no team" and hands the user back into the claim flow.
 */

const maybeSingle = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ eq: () => ({ maybeSingle }) }),
      }),
    }),
  }),
}));

const { getUserClaimedTeamId } = await import("@/lib/leagues/teams");

/** The shape postgrest-js synthesizes client-side for a >1-row maybeSingle. */
const duplicateRows = {
  data: null,
  error: {
    code: "PGRST116",
    details: "Results contain 2 rows, application/vnd.pgrst.object+json requires 1 row",
    hint: null,
    message: "JSON object requested, multiple (or no) rows returned",
  },
};

beforeEach(() => {
  maybeSingle.mockReset();
});

describe("getUserClaimedTeamId", () => {
  it("returns the team id when the user owns exactly one team", async () => {
    maybeSingle.mockResolvedValue({ data: { id: "team-1" }, error: null });
    await expect(getUserClaimedTeamId("league-1", "user-1")).resolves.toBe("team-1");
  });

  it("returns null when the user owns no team in the league", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    await expect(getUserClaimedTeamId("league-1", "user-1")).resolves.toBeNull();
  });

  it("does not report 'no claimed team' when the row set is inconsistent", async () => {
    // Duplicate ownership is exactly the state the partial unique index exists
    // to prevent. Answering null here is the worst available answer: it is
    // indistinguishable from an honest unclaimed user, so the caller silently
    // routes someone who already owns a team back into claiming another one.
    maybeSingle.mockResolvedValue(duplicateRows);
    await expect(getUserClaimedTeamId("league-1", "user-1")).rejects.toThrow();
  });
});
