// scripts/seed-from-sleeper.js
//
// Populates a real Supabase project with test data from a real Sleeper league,
// so the draft can be tested without manually configuring everything by hand.
// See docs/DRAFT_ENGINE.md for the snake-draft pick-order algorithm this
// script implements to pre-generate team_pick_assignments and draft_board.
require("dotenv").config({ path: ".env.local" });

const { createClient } = require("@supabase/supabase-js");

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

// Snake draft order — see docs/DRAFT_ENGINE.md#draft-format-snake-draft
function getTeamIndexForPick(pickNumber, leagueSize) {
  const round = Math.ceil(pickNumber / leagueSize);
  const positionInRound = ((pickNumber - 1) % leagueSize) + 1;
  const teamInRound =
    round % 2 === 1 ? positionInRound : leagueSize - positionInRound + 1;
  return teamInRound - 1; // 0-indexed
}

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

// Sleeper has no single "scoring_format" field — derive it from
// scoring_settings.rec (points per reception), same as src/lib/sleeper/transform.ts.
function deriveScoringFormat(scoringSettings) {
  const rec = scoringSettings?.rec ?? 0;
  if (rec >= 1) return "ppr";
  if (rec > 0) return "half_ppr";
  return "std";
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
          "(leagues.commissioner_id and draft_settings.commissioner_id are NOT NULL)."
      );
      process.exit(1);
    }

    console.log(`Fetching Sleeper league: ${leagueId}`);
    const [league, rosters, users] = await Promise.all([
      fetchFromSleeper(`/league/${leagueId}`),
      fetchFromSleeper(`/league/${leagueId}/rosters`),
      fetchFromSleeper(`/league/${leagueId}/users`),
    ]);
    console.log(`Fetched league data (${rosters.length} teams)\n`);

    // ------------------------------------------------------------------
    // Clear existing data, in FK-safe (child-to-parent) order.
    // ------------------------------------------------------------------
    console.log("Clearing existing test data...");
    const cleanupTables = [
      "audio_events",
      "draft_reset_archive",
      "user_preferences",
      "team_pick_assignments",
      "draft_board",
      "trade_offer_items",
      "trade_offers",
      "rosters",
      "reactions",
      "direct_messages",
      "direct_message_conversations",
      "chat_messages",
      "picks",
      "draft_state",
      "teams",
      "draft_settings",
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
    const rostersPerTeam = league.roster_positions?.length || 15;

    const { data: leagueData, error: leagueError } = await supabase
      .from("leagues")
      .insert({
        commissioner_id: commissionerUserId,
        sleeper_league_id: league.league_id,
        name: league.name,
        season: Number(league.season),
        league_size: rosters.length,
        scoring_format: scoringFormat,
        draft_format: "snake",
        rosters_per_team: rostersPerTeam,
        positions: buildPositionsJson(league.roster_positions),
        league_settings: league.settings || {},
        draft_status: "setup",
      })
      .select()
      .single();
    if (leagueError) throw leagueError;
    const draftHouseLeagueId = leagueData.id;
    console.log(`League created: ${draftHouseLeagueId}\n`);

    // ------------------------------------------------------------------
    // Draft settings
    // ------------------------------------------------------------------
    console.log("Creating draft settings...");
    const { error: settingsError } = await supabase.from("draft_settings").insert({
      league_id: draftHouseLeagueId,
      commissioner_id: commissionerUserId,
      seconds_per_pick: league.settings?.seconds_per_pick || 60,
      allow_pick_trading: true,
      auto_draft_enabled: false,
      auto_draft_type: "ffc_adp",
    });
    if (settingsError) throw settingsError;
    console.log("Draft settings created\n");

    // ------------------------------------------------------------------
    // Teams
    // ------------------------------------------------------------------
    console.log("Creating teams...");
    const teamsToInsert = rosters.map((roster) => {
      const user = users.find((u) => u.user_id === roster.owner_id);
      const teamName = roster.metadata?.team_name || user?.display_name || `Team ${roster.roster_id}`;
      return {
        league_id: draftHouseLeagueId,
        sleeper_user_id: roster.owner_id || null,
        sleeper_team_name: teamName,
        draft_house_team_name: teamName,
        team_image_url: user?.avatar
          ? `https://sleepercdn.com/avatars/${user.avatar}`
          : null,
        draft_position: roster.roster_id,
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

    // draft_position isn't guaranteed contiguous/sorted from Sleeper — sort
    // explicitly so pick-order generation below is deterministic.
    const orderedTeams = [...teamsData].sort((a, b) => a.draft_position - b.draft_position);

    // ------------------------------------------------------------------
    // Draft state
    // ------------------------------------------------------------------
    console.log("Creating draft state...");
    const { error: draftStateError } = await supabase.from("draft_state").insert({
      league_id: draftHouseLeagueId,
      current_pick_number: 1,
      current_team_id: orderedTeams[0].id,
      current_round: 1,
      timer_seconds: league.settings?.seconds_per_pick || 60,
      timer_paused: true, // start paused so you can review before testing
    });
    if (draftStateError) throw draftStateError;
    console.log("Draft state initialized (paused for review)\n");

    // ------------------------------------------------------------------
    // team_pick_assignments + draft_board — one row per pick slot, using the
    // snake-draft order. Didn't exist in the original seed example; both are
    // load-bearing for the draft engine (auto-slotting, next-picker lookup).
    // ------------------------------------------------------------------
    console.log("Generating pick order (team_pick_assignments + draft_board)...");
    const leagueSize = orderedTeams.length;
    const rounds = rostersPerTeam;
    const totalPicks = leagueSize * rounds;

    const assignments = [];
    const boardSlots = [];
    for (let pickNumber = 1; pickNumber <= totalPicks; pickNumber++) {
      const round = Math.ceil(pickNumber / leagueSize);
      const positionInRound = ((pickNumber - 1) % leagueSize) + 1;
      const team = orderedTeams[getTeamIndexForPick(pickNumber, leagueSize)];

      assignments.push({
        league_id: draftHouseLeagueId,
        current_owner_team_id: team.id,
        original_owner_team_id: team.id,
        pick_number: pickNumber,
        round,
        position_in_round: positionInRound,
        status: "active",
      });
      boardSlots.push({
        league_id: draftHouseLeagueId,
        pick_number: pickNumber,
        assigned_team_id: team.id,
        status: "pending",
      });
    }

    const { error: assignmentsError } = await supabase
      .from("team_pick_assignments")
      .insert(assignments);
    if (assignmentsError) throw assignmentsError;

    const { error: boardError } = await supabase.from("draft_board").insert(boardSlots);
    if (boardError) throw boardError;
    console.log(`Generated ${totalPicks} pick slots (${leagueSize} teams x ${rounds} rounds)\n`);

    // ------------------------------------------------------------------
    // Empty rosters — one per team, so lobby/roster views never hit a
    // missing-row case on first load.
    // ------------------------------------------------------------------
    console.log("Creating empty rosters...");
    const rostersToInsert = orderedTeams.map((team) => ({
      team_id: team.id,
      league_id: draftHouseLeagueId,
      players: [],
      bench_count: 0,
      total_players: 0,
    }));
    const { error: rostersError } = await supabase.from("rosters").insert(rostersToInsert);
    if (rostersError) throw rostersError;
    console.log("Rosters initialized\n");

    console.log("=".repeat(50));
    console.log("Database seeded successfully!");
    console.log("=".repeat(50));
    console.log(`
League: ${league.name}
  - ID: ${draftHouseLeagueId}
  - Teams: ${teamsData.length}
  - Rounds: ${rounds}
  - Format: ${scoringFormat.toUpperCase()}

Ready to test! Start the draft at: ${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}
    `);
  } catch (error) {
    console.error("Seed failed:", error.message);
    process.exit(1);
  }
}

seedDatabase();
