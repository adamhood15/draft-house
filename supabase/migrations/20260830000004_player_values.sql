-- Player values from Dynasty Dealer, the ranking source for auto-draft and the
-- draft board's "best available" ordering.
--
--   GET https://www.dynastydealer.com/api/player-values
--   No auth, no key, CORS *. Edge-cached 60s; the engine recalculates daily.
--
-- LICENSE — NOT OPTIONAL
--
-- The API is free for commercial use on exactly one condition: a visible link
-- to dynastydealer.com ("Values by Dynasty Dealer") wherever the values are
-- displayed. That is the entire license, and it is a UI obligation this table
-- creates. Anywhere a value, a rank, or a "best available" ordering derived
-- from these rows reaches a screen, that attribution has to be on it.
--
-- WHY A SEPARATE TABLE AND NOT COLUMNS ON players
--
-- players mirrors Sleeper and nothing else; mixing a second vendor's numbers
-- into it would make "what did Sleeper say" unanswerable. Values are also
-- inherently multi-row per player — the same player carries different numbers
-- in half-PPR than in PPR, and different again in superflex — which a column
-- on players cannot express at all.
--
-- There is deliberately NO `source` column. Dynasty Dealer is the only source,
-- and a discriminator with one value is the kind of abstraction that reads as
-- foresight and behaves as clutter. A second source means adding the column
-- then, against real requirements rather than imagined ones.
--
-- WHY NO FOREIGN KEY TO players
--
-- sleeper_player_id joins players.player_id, but is not constrained to it. The
-- two tables sync independently, players is filtered to active = true, and this
-- feed carries rows for assets that are not active players. A foreign key would
-- turn any of those ordinary mismatches into a failed nightly sync. Indexed
-- instead, and a value with no matching player simply never surfaces.

create table player_values (
  -- Dynasty Dealer's `sleeper_id`, present on 100% of rows. Joins
  -- players.player_id directly — no name matching anywhere in this pipeline.
  sleeper_player_id text not null,

  -- --- which value this is ------------------------------------------------
  -- The API serves two value models with different field sets. Draft House
  -- runs redraft drafts, so `redraft` is what the sync fetches; `dynasty` is
  -- supported here because a Sleeper league can be a dynasty league and the
  -- endpoint already offers it.
  format text not null,
  -- Maps leagues.scoring_format onto the API's `scoring` parameter:
  --   std -> std,  half_ppr -> half,  ppr -> ppr
  -- Dynasty is a single set with no scoring dimension, so its rows carry 'na'
  -- rather than a null — this is part of the primary key, and Postgres primary
  -- keys cannot hold nulls.
  scoring text not null,
  superflex boolean not null default false,

  -- --- present in both models ---------------------------------------------
  -- The ranking signal. base_value is the raw trade-derived engine number;
  -- current_value is that after community vote adjustment, and the docs are
  -- explicit that current_value is the one to use.
  --
  -- Rank is NOT stored. It is `order by current_value desc`, and a stored copy
  -- could disagree with the value it was computed from.
  current_value integer not null,
  base_value integer,
  name text,
  position text,
  team text,
  age integer,
  /** The API's per-row `updated_at` — when this value last changed upstream. */
  value_updated_at timestamptz,

  -- --- redraft only -------------------------------------------------------
  -- The projections arrive as strings ("294.22") and are stored numeric.
  -- Unlike Sleeper's height ("6'2\"") these are genuine numbers that happen to
  -- be serialized as strings — a JSON encoding of a SQL decimal rather than a
  -- formatted value — so converting is faithful, not reinterpretation.
  --
  -- The dynasty model's vote fields (calc_bonus, votes, vote_rating,
  -- vote_impact_percent) are deliberately not stored. current_value already has
  -- the vote adjustment applied — that is the whole reason the docs point at it
  -- over base_value — so keeping the inputs as well would be storing the
  -- arithmetic behind a number we never recompute.
  proj_pts_ppr numeric,
  proj_pts_half numeric,
  proj_pts_std numeric,
  is_rookie boolean,
  /** The projection's season, per the API's own `season` field. */
  season integer,

  synced_at timestamptz not null default now(),

  primary key (sleeper_player_id, format, scoring, superflex),
  constraint player_values_format_check check (format in ('dynasty', 'redraft')),
  -- Keeps the 'na' sentinel from leaking into redraft rows, and a real scoring
  -- format from being attached to dynasty rows where it would be meaningless.
  constraint player_values_scoring_check check (
    (format = 'dynasty' and scoring = 'na')
    or (format = 'redraft' and scoring in ('std', 'half', 'ppr'))
  ),
  constraint player_values_current_value_check check (current_value >= 0)
);

-- The join to players, and the ordering every consumer wants.
create index idx_player_values_player on player_values(sleeper_player_id);
create index idx_player_values_ranking
  on player_values(format, scoring, superflex, current_value desc);
create index idx_player_values_synced_at on player_values(synced_at desc);

-- ============================================================================
-- Notes for the sync
-- ============================================================================
--
-- 1. FILTER OUT PICK ROWS. Dynasty mode returns 1,000 assets, of which 36 are
--    draft picks carrying position = 'PICK'. Draft House drafts players; these
--    rows would sit in the table as permanently unjoinable ids. Redraft mode
--    returns players only and needs no filter.
--
-- 2. THE FEED IS TOP-1000 AND OFFENSE-ONLY. Verified 2026-08-30 against both
--    models: positions are QB, RB, WR, TE and nothing else. There are zero
--    K, DEF, or IDP rows.
--
--    That is a real coverage gap, not a detail. A league with IDP or kicker
--    slots gets no values for those positions, so auto-draft and best-available
--    must degrade for them rather than treating a missing row as a zero — a
--    zero would rank every defensive player below every offensive one and
--    auto-draft would never take them.
--
-- 3. RESPECT THE CACHE. Values change a few times a day and responses are
--    edge-cached for 60 seconds; the docs call a daily fetch sufficient. This
--    shares the once-per-day cadence of the Sleeper player sync.

-- ============================================================================
-- RLS
-- ============================================================================

-- League-independent reference data, like players and team_bye_weeks: readable
-- by any signed-in user, written only by the service role.
alter table player_values enable row level security;

create policy player_values_select on player_values
  for select to authenticated using (true);
