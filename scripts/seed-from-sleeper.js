// scripts/seed-from-sleeper.js
//
// Populates a real Supabase project with test data from a real Sleeper league,
// so the draft can be tested without manually configuring everything by hand.
// Seeds a league up to the LOBBY state only — leagues, drafts and teams.
// draft_picks and rosters are written by startDraft (src/lib/draft/start.ts)
// when the commissioner starts the draft, so seeding no longer pre-creates
// them: doing so both duplicated the pick-order algorithm and made startDraft
// fail on its own uniqueness constraints.
require("dotenv").config({ path: ".env.local" });

const { createClient } = require("@supabase/supabase-js");
// Same module the app import path uses, so seeded seats and imported seats can
// never disagree (Node strips the types on require).
const { assignDraftPositions } = require("../src/lib/sleeper/draft-order.ts");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const fetchFromSleeper = async (path) => {
  const baseUrl = process.env.SLEEPER_API_BASE_URL || "https://api.sleeper.app/v1";
  const res = await fetch(`${baseUrl}${path}`);
  if (!res.ok) {
    throw new Error(`Sleeper API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
};

function buildPositionsJson(rosterPositions) {
  if (!rosterPositions) {
    return { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, DEF: 1, BN: 6 };
  }
  const positions = {};
  for (const pos of rosterPositions) {
    positions[pos] = (positions[pos] || 0) + 1;
  }
  return positions;
}

// GET /league/<league_id> returns `scoring_settings`: a ~130-key map of per-stat
// point values (pass_td, rec_yd, rec, bonus_rec_te, ...). Nothing on the league
// names the format, so collapse the map to a label the way Sleeper's own UI does
// — on `rec`, points per reception (0 / 0.5 / 1).
//
// The draft object carries a `metadata.scoring_type`, but do NOT use it: it's a
// compound league-shape label, not a scoring format. The seed league returns
// "idp_1qb" while being full PPR (rec: 1).
//
// Keep in sync with src/lib/sleeper/transform.ts; that module imports through
// `@/`, so this script can't require it.
function deriveScoringFormat(scoringSettings) {
  const rec = scoringSettings?.rec ?? 0;
  if (rec >= 1) return "ppr";
  if (rec > 0) return "half_ppr";
  return "std";
}

// Draft order types with a home in DRAFT_ORDER_TYPES (src/lib/draft/order.ts).
// Sleeper also has "auction", which Draft House cannot lay out.
const SUPPORTED_DRAFT_FORMATS = ["snake", "linear"];

/**
 * The league's live draft.
 *
 * Fetched by id rather than off GET /league/<id>/drafts, for two reasons:
 *
 *   - That endpoint is an ARRAY with no documented ordering, and a league can
 *     hold more than one draft (a deleted-and-recreated draft leaves the old
 *     one behind; dynasty leagues carry a rookie draft alongside the startup).
 *     Taking [0] can silently source the clock, rounds, order type AND every
 *     seat from a draft that isn't happening. `league.draft_id` names the live
 *     one outright.
 *   - GET /draft/<draft_id> is the only endpoint that returns
 *     `slot_to_roster_id`, the slot → roster_id map that seats a roster with
 *     no owner. See src/lib/sleeper/draft-order.ts.
 *
 * Falls back to the list for a league with no draft_id, which is how Sleeper
 * represents a league whose draft has not been created.
 */
async function fetchDraft(leagueId, league) {
  if (league.draft_id) {
    return fetchFromSleeper(`/draft/${league.draft_id}`);
  }
  const drafts = await fetchFromSleeper(`/league/${leagueId}/drafts`);
  return drafts?.[0] ?? null;
}

/**
 * Everything draft-shaped lives on the DRAFT object (see fetchDraft above), not
 * the league, and Sleeper's names for it don't match ours. Two are easy to get
 * wrong, and both were wrong here:
 *
 *   settings.pick_timer   Seconds per pick, stored as drafts.pick_timer. There
 *                         is no `seconds_per_pick` on any Sleeper payload —
 *                         reading that name returns undefined and silently
 *                         takes the 60s fallback, so every seeded league
 *                         drafted on a 60s clock no matter what Sleeper said.
 *                         0 is Sleeper's "unlimited" and is stored as 0.
 *   settings.rounds       The board's round count, stored as drafts.rounds and
 *                         handed to generateDraftOrder by start.ts. It can
 *                         legitimately differ from roster_positions.length (a
 *                         rookie draft has fewer rounds than roster slots), and
 *                         the draft is authoritative about its own board.
 *
 * Returns the mapped values plus every divergence worth a human looking at;
 * the caller prints them. Nothing here throws — a seed that stops because
 * Sleeper used an order type we lack is worse than one that says so and
 * carries on with a format the commissioner can change on the setup page.
 */
function readDraftConfig(draft, league, teamRosters) {
  const warnings = [];
  const warn = (message) => warnings.push(message);

  if (!draft) {
    warn("League has no draft on Sleeper — seeding Draft House defaults for every draft setting.");
    return {
      warnings,
      draftFormat: "snake",
      pickTimer: 60,
      autoDraftEnabled: false,
      leagueSize: teamRosters.length,
      rounds: league.roster_positions?.length || 15,
      draftStartTime: null,
    };
  }

  const settings = draft.settings ?? {};

  // ---- order type -------------------------------------------------------
  let draftFormat = draft.type;
  if (!SUPPORTED_DRAFT_FORMATS.includes(draftFormat)) {
    warn(
      `Sleeper draft type "${draft.type}" has no Draft House equivalent — seeding "snake". ` +
        `Change it on the setup page if that's wrong.`
    );
    draftFormat = "snake";
  }
  // Sleeper's 3rd-round reversal is a distinct order, not a snake. We have no
  // type for it, so the seeded board WILL diverge from Sleeper's at that round.
  if (Number(settings.reversal_round) > 0) {
    warn(
      `Sleeper reverses this draft at round ${settings.reversal_round} (reversal draft). ` +
        `DRAFT_ORDER_TYPES has no such type — seeding a plain ${draftFormat}, whose board ` +
        `differs from round ${settings.reversal_round} on.`
    );
  }

  // ---- clock ------------------------------------------------------------
  // One column, drafts.pick_timer, holding Sleeper's own convention: 0 is
  // "unlimited". There used to be a second timer_enabled flag beside it, which
  // meant two columns that could contradict each other about the same fact.
  //
  // Whatever Sleeper says goes in verbatim, with no floor — the clock length is
  // the commissioner's call.
  const rawPickTimer = Number(settings.pick_timer);
  let pickTimer = 60;
  if (!Number.isFinite(rawPickTimer)) {
    warn("Sleeper draft has no settings.pick_timer — seeding 60s.");
  } else {
    pickTimer = rawPickTimer;
    if (rawPickTimer === 0) {
      warn("Sleeper draft has no pick clock (pick_timer: 0) — seeding an unlimited clock.");
    }
  }

  // ---- board size -------------------------------------------------------
  // Sleeper says "roster" for two different things, and they are one letter
  // apart at a glance:
  //
  //   GET /league/<id>/rosters   ONE OBJECT PER TEAM. `teamRosters.length` is
  //                              the number of teams (8 here, roster_id 1..8,
  //                              each with its own owner_id) — NOT roster spots.
  //   league.roster_positions    The roster SPOTS on each team (13 here:
  //                              QB, RB, RB, WR, WR, TE, FLEX, FLEX, IDP_FLEX,
  //                              BN x4). Read below as `rosterSlots`.
  //
  // league_size is the first; rosters_per_team is the second.
  //
  // settings.teams is deliberately ignored. Sleeper derives it from the league,
  // so it agrees with total_rosters, settings.num_teams and /rosters by
  // construction — there is no state where it disagrees and is right. The team
  // count has to be the roster count regardless: this script seeds one `teams`
  // row per Sleeper team roster, and startDraft refuses to build a board unless
  // allTeams.length === league_size.
  const leagueSize = teamRosters.length;

  // rounds comes off the draft, full stop — it is the number of rounds the
  // board has, and settings.rounds is the only field that states it. Draft
  // House stores it as leagues.rosters_per_team, which start.ts hands straight
  // to generateDraftOrder.
  //
  // roster_positions.length is NOT a second opinion on this. It counts the
  // league's roster SPOTS, which a draft is free to differ from — a rookie
  // draft fills a few rounds onto rosters with twenty-odd slots. It is only a
  // last resort for a draft that somehow arrives without settings.rounds, and
  // that case is warned rather than treated as a normal disagreement.
  const draftRounds = Number(settings.rounds);
  let rounds = draftRounds;
  if (!Number.isFinite(draftRounds) || draftRounds <= 0) {
    rounds = league.roster_positions?.length || 15;
    warn(`Sleeper draft has no settings.rounds — falling back to ${rounds} league roster slots.`);
  }

  // ---- everything else --------------------------------------------------
  // cpu_autopick is Sleeper's "auto-pick for absent managers", the same intent
  // as auto_draft_enabled. auto_draft_type stays 'ffc_adp': Sleeper exposes no
  // rankings, so the source is ours regardless of what Sleeper is set to.
  const autoDraftEnabled = Number(settings.cpu_autopick) === 1;

  // Epoch ms on Sleeper, timestamptz here. A scheduled-but-unset draft sends 0.
  const startTime = Number(draft.start_time);
  const draftStartTime =
    Number.isFinite(startTime) && startTime > 0 ? new Date(startTime).toISOString() : null;

  return {
    warnings,
    draftFormat,
    pickTimer,
    autoDraftEnabled,
    leagueSize,
    rounds,
    draftStartTime,
  };
}

async function seedDatabase() {
  try {
    console.log("Starting database seed from Sleeper...\n");

    const leagueId = process.env.SLEEPER_LEAGUE_ID;
    const commissionerUserId = process.env.SEED_COMMISSIONER_USER_ID;

    if (!leagueId) {
      console.error("Error: Set SLEEPER_LEAGUE_ID in .env.local");
      process.exit(1);
    }
    if (!commissionerUserId) {
      console.error(
        "Error: Set SEED_COMMISSIONER_USER_ID in .env.local to a real auth user id " +
          "(leagues.commissioner_id is NOT NULL)."
      );
      process.exit(1);
    }

    console.log(`Fetching Sleeper league: ${leagueId}`);
    const [league, teamRosters, users] = await Promise.all([
      fetchFromSleeper(`/league/${leagueId}`),
      fetchFromSleeper(`/league/${leagueId}/rosters`),
      fetchFromSleeper(`/league/${leagueId}/users`),
    ]);
    // Every draft setting lives on the draft, not the league — and the draft
    // has to be fetched second, because the league is what names it.
    const draft = await fetchDraft(leagueId, league);
    console.log(`Fetched league data (${teamRosters.length} teams)\n`);

    // ------------------------------------------------------------------
    // Clear existing data, in FK-safe (child-to-parent) order.
    // ------------------------------------------------------------------
    console.log("Clearing existing test data...");
    // reactions and chat_messages both point at draft_picks, so they have to go
    // first — draft_picks is a parent now that slots and picks are one table.
    const cleanupTables = [
      "audio_events",
      "draft_reset_archive",
      "user_preferences",
      "trade_offer_items",
      "trade_offers",
      "reactions",
      "direct_messages",
      "direct_message_conversations",
      "chat_messages",
      "draft_picks",
      "rosters",
      "drafts",
      "teams",
      "leagues",
    ];
    for (const table of cleanupTables) {
      const { error } = await supabase.from(table).delete().not("id", "is", null);
      if (error && error.code !== "42703") {
        // 42703 = no "id" column (e.g. user_preferences has a composite key) — fall back
        await supabase.from(table).delete().neq("league_id", "00000000-0000-0000-0000-000000000000");
      }
    }
    console.log("Database cleared\n");

    // ------------------------------------------------------------------
    // League
    // ------------------------------------------------------------------
    console.log("Creating league...");
    // roster_positions and scoring_settings are top-level fields on the
    // Sleeper league object, not nested under `settings` — verified against
    // the live API (see src/lib/sleeper/transform.ts).
    const scoringFormat = deriveScoringFormat(league.scoring_settings);
    const draftConfig = readDraftConfig(draft, league, teamRosters);
    const rostersPerTeam = draftConfig.rounds;

    for (const warning of draftConfig.warnings) {
      console.warn(`  ! ${warning}`);
    }

    const { data: leagueData, error: leagueError } = await supabase
      .from("leagues")
      .insert({
        commissioner_id: commissionerUserId,
        sleeper_league_id: league.league_id,
        name: league.name,
        season: Number(league.season),
        league_size: draftConfig.leagueSize,
        scoring_format: scoringFormat,
        rosters_per_team: rostersPerTeam,
        positions: buildPositionsJson(league.roster_positions),
        league_settings: league.settings || {},
      })
      .select()
      .single();
    if (leagueError) throw leagueError;
    const draftHouseLeagueId = leagueData.id;
    console.log(`League created: ${draftHouseLeagueId}\n`);

    // ------------------------------------------------------------------
    // Draft
    // ------------------------------------------------------------------
    console.log("Creating draft...");
    // The `drafts` row is the parent record — Sleeper's draft object, plus the
    // live clock and the few settings Sleeper has no equivalent for.
    //
    // settings/metadata are stored verbatim as provenance and are never read
    // back; rounds and pick_timer are the promoted, authoritative copies. See
    // the header of 20260830000002_drafts_consolidation.sql.
    //
    // allow_pick_trading has no Sleeper counterpart — it's a Draft House
    // feature (docs/TRADES.md), so it keeps the table default.
    const { error: draftInsertError } = await supabase.from("drafts").insert({
      league_id: draftHouseLeagueId,
      sleeper_draft_id: draft?.draft_id ?? null,
      type: draftConfig.draftFormat,
      status: "setup",
      sport: draft?.sport || "nfl",
      season: Number(draft?.season) || Number(league.season),
      season_type: draft?.season_type || "regular",
      start_time: draftConfig.draftStartTime,
      settings: draft?.settings || {},
      metadata: draft?.metadata || {},
      draft_order: draft?.draft_order ?? null,
      slot_to_roster_id: draft?.slot_to_roster_id ?? null,
      rounds: draftConfig.rounds,
      pick_timer: draftConfig.pickTimer,
      allow_pick_trading: true,
      auto_draft_enabled: draftConfig.autoDraftEnabled,
      auto_draft_type: "ffc_adp",
    });
    if (draftInsertError) throw draftInsertError;
    console.log("Draft created\n");

    // ------------------------------------------------------------------
    // Teams
    // ------------------------------------------------------------------
    console.log("Creating teams...");
    const draftPositions = assignDraftPositions(teamRosters, {
      slotToRosterId: draft?.slot_to_roster_id,
      draftOrder: draft?.draft_order,
    });
    const teamsToInsert = teamRosters.map((roster) => {
      const user = users.find((u) => u.user_id === roster.owner_id);
      // The manager's team name and uploaded team avatar are on the league
      // USER, not the roster — /rosters carries notification preferences and
      // no name at all. Mirrors sleeperTeamName / sleeperTeamImageUrl in
      // src/lib/sleeper/transform.ts.
      const teamName =
        user?.metadata?.team_name ||
        roster.metadata?.team_name ||
        user?.display_name ||
        `Team ${roster.roster_id}`;
      // metadata.avatar is a full URL; the top-level `avatar` is an id.
      const teamImageUrl =
        user?.metadata?.avatar ||
        (user?.avatar ? `https://sleepercdn.com/avatars/${user.avatar}` : null);
      return {
        league_id: draftHouseLeagueId,
        sleeper_user_id: roster.owner_id || null,
        // What drafts.slot_to_roster_id points at — without it that map is a
        // stored blob nothing can resolve back to a team.
        sleeper_roster_id: roster.roster_id,
        // sleeper_* is Sleeper's copy, draft_house_* is the editable one; they
        // start equal. custom_image_url stays unset — that's the in-app
        // override, written only when someone picks a picture.
        sleeper_team_name: teamName,
        draft_house_team_name: teamName,
        team_image_url: teamImageUrl,
        draft_position: draftPositions.get(roster.roster_id),
        is_auto_draft: !roster.owner_id,
        family_league_wins: 0,
      };
    });
    const { data: teamsData, error: teamsError } = await supabase
      .from("teams")
      .insert(teamsToInsert)
      .select();
    if (teamsError) throw teamsError;
    console.log(`Created ${teamsData.length} teams\n`);

    // ------------------------------------------------------------------
    // Stop here, at the lobby.
    //
    // draft_picks and rosters are draft load, and startDraft
    // (src/lib/draft/start.ts) owns them. Pre-creating them here duplicated the
    // snake algorithm and left every seeded league unable to start: startDraft
    // inserts into these same tables and would hit draft_picks_unique_slot on
    // the first try.
    // ------------------------------------------------------------------
    const rounds = rostersPerTeam;

    console.log("=".repeat(50));
    console.log("Database seeded successfully!");
    console.log("=".repeat(50));
    console.log(`
League: ${league.name}
  - ID: ${draftHouseLeagueId}
  - Teams: ${teamsData.length}
  - Rounds: ${rounds}
  - Scoring: ${scoringFormat.toUpperCase()}
  - Order: ${draftConfig.draftFormat}
  - Clock: ${draftConfig.pickTimer > 0 ? `${draftConfig.pickTimer}s per pick` : "unlimited"}
  - Auto-draft: ${draftConfig.autoDraftEnabled ? "on" : "off"}
  - Starts: ${draftConfig.draftStartTime ?? "not scheduled"}

Seeded to the LOBBY. Review settings, then open the lobby and start the draft:
  ${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/leagues/${draftHouseLeagueId}/setup
    `);
  } catch (error) {
    console.error("Seed failed:", error.message);
    process.exit(1);
  }
}

seedDatabase();
