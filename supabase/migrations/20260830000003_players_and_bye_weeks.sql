-- The player cache, plus the bye-week lookup that GET /players/nfl does not
-- provide.
--
-- `players` mirrors Sleeper's GET /players/nfl payload field-for-field. Verified
-- against the live endpoint on 2026-08-30: 12,225 players, 53 keys, and every
-- key present on every player — Sleeper sends nulls rather than omitting.
--
-- WHY NO PROVENANCE JSONB HERE
--
-- drafts (20260830000002) keeps Sleeper's settings/metadata objects verbatim
-- alongside its promoted columns, because a league's settings become
-- unrecoverable the moment the commissioner changes them upstream. That does
-- not apply here: this table is refetched in full every day, so the payload is
-- always recoverable and a second copy earns nothing but storage. The columns
-- below ARE the mirror.
--
-- ONLY active = true IS STORED
--
-- The sync filters to active players; an inactive player should not be
-- draftable. That is 9,418 of 12,225 — a smaller cut than it sounds, and 6,358
-- of the survivors are free agents with team = null.
--
-- A player who flips to active = false vanishes from this table on the next
-- sync. Completed boards survive that because draft_picks denormalizes
-- player_name / player_position / player_nfl_team at pick time, so those
-- columns are load-bearing rather than merely convenient.
--
-- TYPES ARE SLEEPER'S, NOT TIDIED
--
-- height ("6'2\""), weight ("234") and player_shard ("7") arrive as strings and
-- stay strings. Mirroring means not silently reinterpreting: parsing weight to
-- an integer here would be this file quietly inventing a schema Sleeper did not
-- send, and the first value that does not parse becomes a failed daily sync.

-- ============================================================================
-- players
-- ============================================================================

create table players (
  -- Sleeper's player_id. This is the value draft_picks.sleeper_player_id holds
  -- and what rosters.players entries key on. Text, not a number: Sleeper uses
  -- team abbreviations as ids for defenses ("DEF" rows are keyed "ARI", "SF").
  player_id text primary key,

  -- --- identity -----------------------------------------------------------
  first_name text,
  last_name text,
  full_name text,
  hashtag text,

  -- --- search -------------------------------------------------------------
  -- search_rank is Sleeper's own search ordering, with 9999999 as the
  -- "unranked" sentinel. It is NOT a fantasy ranking and must not be used as
  -- one — player values come from a separate source into player_values.
  search_first_name text,
  search_last_name text,
  search_full_name text,
  search_rank integer,
  player_shard text,

  -- --- position and team --------------------------------------------------
  position text,
  fantasy_positions jsonb,
  depth_chart_position text,
  depth_chart_order integer,
  number integer,
  -- Joins team_bye_weeks.team. Null for the ~6,358 active free agents, who
  -- therefore have no bye week — correctly, since they are on no schedule.
  team text,
  team_abbr text,
  team_changed_at timestamptz,

  -- --- status and injury --------------------------------------------------
  status text,
  active boolean,
  injury_status text,
  injury_body_part text,
  injury_start_date date,
  injury_notes text,
  practice_participation text,
  practice_description text,
  news_updated timestamptz,

  -- --- biographical -------------------------------------------------------
  age integer,
  birth_date date,
  birth_city text,
  birth_state text,
  birth_country text,
  height text,
  weight text,
  college text,
  high_school text,
  years_exp integer,

  -- --- sport --------------------------------------------------------------
  sport text,
  competitions jsonb,
  metadata jsonb,

  -- --- external ids -------------------------------------------------------
  -- Kept in full. These are the join keys to any outside data source, and the
  -- ranking source is still being chosen — dropping them means a migration at
  -- exactly the moment they are needed. Types follow the payload: some of these
  -- arrive as numbers and some as strings, which is Sleeper's inconsistency,
  -- not ours.
  espn_id integer,
  yahoo_id integer,
  rotowire_id integer,
  rotoworld_id integer,
  stats_id integer,
  swish_id integer,
  fantasy_data_id integer,
  sportradar_id text,
  gsis_id text,
  oddsjam_id text,
  kalshi_id text,
  pandascore_id text,
  opta_id text,

  -- Per-row, so a partial sync is visible rather than looking complete.
  synced_at timestamptz not null default now()
);

-- The once-per-day gate reads max(synced_at); this keeps that a cheap index
-- scan rather than a walk over ~9,400 rows.
create index idx_players_synced_at on players(synced_at desc);
-- Draft search and position filters.
create index idx_players_position on players(position);
create index idx_players_team on players(team);
create index idx_players_search_full_name on players(search_full_name);

-- ============================================================================
-- team_bye_weeks
-- ============================================================================

-- Sleeper's player payload carries no bye week — confirmed absent across all
-- 12,225 players — so it is derived from the NFL schedule: a team with no game
-- in week W has its bye in week W.
--
-- WHY THIS IS A TABLE AND NOT A COLUMN ON players
--
-- A bye week is a function of (season, team). Across ~3,000 rostered players
-- there are exactly 32 distinct answers. Denormalizing it onto each player
-- would mean rewriting thousands of rows on every daily sync, and again
-- whenever anyone changes teams, to store 32 facts. Joined on players.team it
-- costs nothing and cannot go stale relative to the team the player is on.
create table team_bye_weeks (
  season integer not null,
  -- SLEEPER's abbreviation, deliberately — this column exists to join
  -- players.team, so it must speak that vocabulary. The schedule source is
  -- normalized into it on write, never the other way around. See the alias
  -- note below; getting this backwards is a silent null, not an error.
  team text not null,
  bye_week integer not null,
  synced_at timestamptz not null default now(),

  primary key (season, team),
  constraint team_bye_weeks_bye_week_check check (bye_week between 1 and 18)
);

-- Verified 2026-08-30 against ESPN's schedule for 2025 (32/32 teams resolved)
-- and 2026 (18/18 weeks published). The vocabularies do not match:
--
--   in Sleeper but not ESPN:  OAK  WAS
--   in ESPN but not Sleeper:  WSH
--
-- WAS/WSH is the same team spelled differently. Joined naively, every
-- Washington player gets a null bye — no error, no failed row, just a blank
-- column that surfaces when someone drafts their kicker. The sync normalizes
-- ESPN -> Sleeper before writing, and an abbreviation that matches nothing is
-- logged rather than dropped.
--
-- OAK is stale on Sleeper's side: players still tagged to a team that has not
-- existed since 2019. They resolve to no bye, which is correct.

-- ============================================================================
-- RLS
-- ============================================================================

-- Both tables are league-independent reference data — the same NFL players and
-- the same schedule for everyone — so there is no league_id to scope by and
-- is_league_member does not apply. Readable by any signed-in user; writes are
-- service-role only, like every other cache in this schema.
alter table players enable row level security;
alter table team_bye_weeks enable row level security;

create policy players_select on players
  for select to authenticated using (true);

create policy team_bye_weeks_select on team_bye_weeks
  for select to authenticated using (true);
