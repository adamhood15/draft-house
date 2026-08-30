import { beforeEach, describe, expect, it, vi } from "vitest";
import { queryBuilder, type FromStub, type QueryResult } from "@/lib/leagues/test-helpers";
import { expectRedirect } from "@/lib/leagues/test-helpers";

/**
 * Draft load. Import creates leagues, drafts and teams; the slots themselves
 * (draft_picks) and the empty rosters are created here, so this action is what
 * turns a lobby into a draftable board.
 *
 * Three properties are load-bearing and none is visible in a "did it succeed"
 * assertion:
 *
 *   1. draft_picks and rosters are written on the service-role client. They
 *      have select-only RLS by design (docs/SECURITY.md, "Core principle"), so
 *      a write routed through the authenticated client silently matches zero
 *      rows and reports success.
 *   2. The clock columns on `drafts` are also service-role only, even though
 *      the row itself is commissioner-writable — a column grant, not a policy,
 *      is what keeps current_pick_no and timer_seconds out of the browser's
 *      reach. Writing them on the authenticated client would look fine here
 *      and fail silently in production.
 *   3. The lobby → drafting transition is the mutex. Two commissioners
 *      clicking at once must not both generate a board.
 */

let authFrom: FromStub;
let adminFrom: FromStub;
let currentUser: { id: string } | null;

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (...args: unknown[]) => authFrom(...args),
    auth: { getUser: async () => ({ data: { user: currentUser } }) },
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: (...args: unknown[]) => adminFrom(...args) }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { startDraft } = await import("@/lib/draft/start");

const COMMISSIONER = "user-commish";
const LEAGUE = "league-1";
const DRAFT = "draft-1";
const LEAGUE_SIZE = 8;
/** Rounds = roster spots per team, so every seat picks in every round. */
const ROUNDS = 13;
/** The board is exactly this big — derived, so changing either constant above still tests something. */
const TOTAL_PICKS = LEAGUE_SIZE * ROUNDS;

/** teams rows: seat N is `team-N`, so a pick's owner is readable at a glance. */
const TEAMS = Array.from({ length: LEAGUE_SIZE }, (_, index) => ({
  id: `team-${index + 1}`,
  draft_position: index + 1,
}));

function leagueRow(overrides: Record<string, unknown> = {}) {
  return {
    id: LEAGUE,
    commissioner_id: COMMISSIONER,
    league_size: LEAGUE_SIZE,
    ...overrides,
  };
}

function draftRow(overrides: Record<string, unknown> = {}) {
  return {
    id: DRAFT,
    status: "lobby",
    type: "snake",
    rounds: ROUNDS,
    pick_timer: 90,
    ...overrides,
  };
}

type Recorded = { table: string; payload: unknown };

/**
 * A `from` stub that answers per table rather than in call order, and records
 * what was written. Call-order queues (queuedFrom) can't express this action:
 * it touches three tables on one client and three on the other, and reordering
 * two reads would silently shift every queued answer by one.
 */
function tableFrom(
  results: Record<string, QueryResult[]>,
  inserts: Recorded[] = [],
  updates: Recorded[] = []
): FromStub {
  const queues: Record<string, QueryResult[]> = {};
  for (const [table, list] of Object.entries(results)) queues[table] = [...list];

  return (table: unknown) => {
    const name = String(table);
    const result = queues[name]?.shift() ?? { data: null, error: null };
    const chain = queryBuilder(result) as Record<string, unknown>;

    const passInsert = chain.insert as () => unknown;
    chain.insert = (payload: unknown) => {
      inserts.push({ table: name, payload });
      return passInsert();
    };
    const passUpdate = chain.update as () => unknown;
    chain.update = (payload: unknown) => {
      updates.push({ table: name, payload });
      return passUpdate();
    };
    return chain;
  };
}

const OK: QueryResult = { data: [{ id: "row" }], error: null };
const CLAIMED: QueryResult = { data: [{ id: DRAFT }], error: null };
const NOT_CLAIMED: QueryResult = { data: [], error: null };

let adminInserts: Recorded[];
let adminUpdates: Recorded[];
let authInserts: Recorded[];
let authUpdates: Recorded[];

/** Wires both clients for a league that is ready to draft. */
function arrange(
  options: {
    league?: Record<string, unknown>;
    draft?: Record<string, unknown>;
    claim?: QueryResult;
    teams?: QueryResult;
    admin?: Record<string, QueryResult[]>;
  } = {}
) {
  adminInserts = [];
  adminUpdates = [];
  authInserts = [];
  authUpdates = [];

  authFrom = tableFrom(
    {
      leagues: [{ data: leagueRow(options.league), error: null }],
      // Read first, then the guarded claim, then the release if one happens.
      drafts: [{ data: draftRow(options.draft), error: null }, options.claim ?? CLAIMED, OK],
      teams: [options.teams ?? { data: TEAMS, error: null }],
    },
    authInserts,
    authUpdates
  );
  adminFrom = tableFrom(
    options.admin ?? { drafts: [OK], draft_picks: [OK], rosters: [OK] },
    adminInserts,
    adminUpdates
  );
}

function written(table: string): unknown[] {
  const row = adminInserts.find((entry) => entry.table === table);
  return (row?.payload as unknown[]) ?? [];
}

/** The clock write — the one update startDraft makes on the service-role client. */
function clockWrite() {
  return adminUpdates.find((entry) => entry.table === "drafts")?.payload as Record<string, unknown>;
}

beforeEach(() => {
  currentUser = { id: COMMISSIONER };
  arrange();
});

describe("startDraft authorization and preconditions", () => {
  it("refuses anyone who is not the league commissioner", async () => {
    currentUser = { id: "user-someone-else" };
    const state = await startDraft(LEAGUE);
    expect(state.error).toBe("Only the commissioner can start the draft.");
    expect(adminInserts).toEqual([]);
  });

  it("refuses a signed-out caller", async () => {
    currentUser = null;
    const state = await startDraft(LEAGUE);
    expect(state.error).toBe("You must be signed in to start the draft.");
    expect(adminInserts).toEqual([]);
  });

  it.each(["setup", "drafting", "complete"])(
    "refuses to start a league already in the %s phase",
    async (phase) => {
      arrange({ draft: { status: phase } });
      const state = await startDraft(LEAGUE);
      expect(state.error).toContain(phase);
      expect(adminInserts).toEqual([]);
    }
  );

  it("refuses when the league has fewer teams than seats", async () => {
    arrange({ league: { league_size: 12 } });
    const state = await startDraft(LEAGUE);
    expect(state.error).toBe(
      `This league has ${LEAGUE_SIZE} of 12 teams. Every seat must be filled to draft.`
    );
    expect(adminInserts).toEqual([]);
  });

  it("refuses when draft positions are not exactly one per seat", async () => {
    // A duplicate seat would hand two teams the same picks and leave one team
    // with none — the board would still generate, and still be wrong.
    arrange({
      teams: {
        data: [...TEAMS.slice(0, 7), { id: "team-dupe", draft_position: 1 }],
        error: null,
      },
    });
    const state = await startDraft(LEAGUE);
    expect(state.error).toBe(
      `Team draft positions must be exactly 1 to ${LEAGUE_SIZE}, with no duplicates.`
    );
    expect(adminInserts).toEqual([]);
  });
});

describe("startDraft board generation", () => {
  it("writes one draft_picks row per slot, owned by the seat that holds it", async () => {
    await expectRedirect(startDraft(LEAGUE), `/leagues/${LEAGUE}/draft`);

    const picks = written("draft_picks") as {
      pick_no: number;
      team_id: string;
      status: string;
      draft_id: string;
    }[];
    expect(picks).toHaveLength(TOTAL_PICKS);
    expect(picks.every((row) => row.status === "pending")).toBe(true);
    expect(picks.every((row) => row.draft_id === DRAFT)).toBe(true);

    const byPick = new Map(picks.map((row) => [row.pick_no, row.team_id]));
    // Seat 6's first three picks in an 8-team snake.
    expect(byPick.get(6)).toBe("team-6");
    expect(byPick.get(11)).toBe("team-6");
    expect(byPick.get(22)).toBe("team-6");
    // The turn of the snake — picks 8 and 9 are both seat 8.
    expect(byPick.get(8)).toBe("team-8");
    expect(byPick.get(9)).toBe("team-8");
  });

  it("starts every pick with its original owner as its current owner", async () => {
    // `team_id <> original_team_id` is what makes a pick traded, so nothing
    // may look traded before a trade has happened.
    await expectRedirect(startDraft(LEAGUE), `/leagues/${LEAGUE}/draft`);

    const picks = written("draft_picks") as {
      pick_no: number;
      round: number;
      draft_slot: number;
      team_id: string;
      original_team_id: string;
    }[];

    expect(picks.every((row) => row.team_id === row.original_team_id)).toBe(true);

    const seatSix = picks
      .filter((row) => row.team_id === "team-6")
      .map((row) => row.pick_no)
      .sort((a, b) => a - b);
    expect(seatSix).toEqual([6, 11, 22, 27, 38, 43, 54, 59, 70, 75, 86, 91, 102]);

    // draft_slot is the seat, which is stable across the snake's reversal —
    // not the place in the round's sequence, which mirrors on even rounds.
    expect(picks.find((row) => row.pick_no === 11)).toMatchObject({ round: 2, draft_slot: 6 });
  });

  it("lays out a linear league in seat order every round", async () => {
    arrange({ draft: { type: "linear" } });
    await expectRedirect(startDraft(LEAGUE), `/leagues/${LEAGUE}/draft`);

    const picks = written("draft_picks") as { pick_no: number; team_id: string }[];
    const byPick = new Map(picks.map((row) => [row.pick_no, row.team_id]));
    expect(byPick.get(6)).toBe("team-6");
    expect(byPick.get(14)).toBe("team-6");
    // Where a snake would give pick 9 to seat 8, a linear draft returns to seat 1.
    expect(byPick.get(9)).toBe("team-1");
  });
});

describe("startDraft initial state", () => {
  it("puts the first seat on the clock with the configured timer", async () => {
    await expectRedirect(startDraft(LEAGUE), `/leagues/${LEAGUE}/draft`);

    expect(clockWrite()).toMatchObject({
      current_pick_no: 1,
      current_round: 1,
      current_team_id: "team-1",
      timer_seconds: 90,
      timer_active: true,
      timer_paused: false,
    });
    expect(clockWrite().started_at).toBeTruthy();
  });

  it("opens a draft with no pick timer as inactive", async () => {
    // pick_timer = 0 is Sleeper's "unlimited". The clock must open switched
    // off rather than counting down from zero.
    arrange({ draft: { pick_timer: 0 } });
    await expectRedirect(startDraft(LEAGUE), `/leagues/${LEAGUE}/draft`);

    expect(clockWrite()).toMatchObject({ timer_active: false, timer_seconds: 0 });
  });

  it("opens an empty roster for every team", async () => {
    await expectRedirect(startDraft(LEAGUE), `/leagues/${LEAGUE}/draft`);

    const rosters = written("rosters") as { team_id: string; players: unknown[] }[];
    expect(rosters).toHaveLength(LEAGUE_SIZE);
    expect(rosters.map((row) => row.team_id).sort()).toEqual(TEAMS.map((t) => t.id).sort());
    expect(rosters.every((row) => Array.isArray(row.players) && row.players.length === 0)).toBe(
      true
    );
  });
});

describe("startDraft server authority", () => {
  it("writes the board and the rosters with the service-role client", async () => {
    await expectRedirect(startDraft(LEAGUE), `/leagues/${LEAGUE}/draft`);

    expect(adminInserts.map((entry) => entry.table).sort()).toEqual(["draft_picks", "rosters"]);
    // These tables have select-only RLS, so an insert on the authenticated
    // client would be dropped and still report success.
    expect(authInserts).toEqual([]);
  });

  it("writes the clock with the service-role client, never the commissioner's", async () => {
    await expectRedirect(startDraft(LEAGUE), `/leagues/${LEAGUE}/draft`);

    // drafts is commissioner-writable, so this one is easy to get wrong: the
    // clock columns sit outside the column grant, and an authenticated write
    // to them fails silently rather than erroring.
    expect(adminUpdates.map((entry) => entry.table)).toContain("drafts");
    for (const update of authUpdates) {
      expect(Object.keys(update.payload as object)).toEqual(["status"]);
    }
  });
});

describe("startDraft transition", () => {
  it("claims lobby → drafting before writing the board", async () => {
    await expectRedirect(startDraft(LEAGUE), `/leagues/${LEAGUE}/draft`);
    expect(authUpdates).toContainEqual({ table: "drafts", payload: { status: "drafting" } });
  });

  it("does not build a second board when the transition was already claimed", async () => {
    // The guarded update matches nothing because another click already moved
    // the draft out of the lobby.
    arrange({ claim: NOT_CLAIMED });
    const state = await startDraft(LEAGUE);
    expect(state.error).toBe("The draft has already been started.");
    expect(adminInserts).toEqual([]);
  });

  it("returns the draft to the lobby when the board write fails", async () => {
    arrange({
      admin: {
        drafts: [OK],
        draft_picks: [{ data: null, error: { message: "insert failed" } }],
        rosters: [OK],
      },
    });

    const state = await startDraft(LEAGUE);
    expect(state.error).toBe("Couldn't build the draft board. Please try again.");
    // Otherwise the draft is stranded in 'drafting' with no board to draft on.
    expect(authUpdates).toContainEqual({ table: "drafts", payload: { status: "lobby" } });
  });
});
