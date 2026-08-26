-- Draft House core schema.
-- Source of truth: docs/DATABASE.md. Keep this file in sync with that doc —
-- do not add/rename/drop columns here without updating DATABASE.md first.
--
-- Two things exist here that DATABASE.md doesn't spell out as columns, because
-- they're plumbing, not schema:
--   1. users.id is a FK to auth.users(id) with a signup trigger, since every
--      RLS policy (see docs/REALTIME.md) assumes auth.uid() = users.id.
--   2. A generic set_updated_at() trigger keeps every `updated_at` column
--      accurate without relying on application code to set it.

-- ============================================================================
-- Helper: auto-maintained updated_at
-- ============================================================================

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ============================================================================
-- 1. users
-- ============================================================================

create table users (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  auth_email text not null unique,
  display_name text not null,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_users_updated_at
  before update on users
  for each row execute function set_updated_at();

-- Populates public.users whenever a new auth.users row is created via
-- supabase.auth.signUp() — see src/lib/auth/actions.ts. A duplicate username
-- fails this trigger, which fails the whole auth.users insert transaction;
-- the app catches that as "username already taken."
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.users (id, username, auth_email, display_name)
  values (
    new.id,
    new.raw_user_meta_data ->> 'username',
    new.email,
    new.raw_user_meta_data ->> 'display_name'
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ============================================================================
-- 2. leagues
-- ============================================================================

create table leagues (
  id uuid primary key default gen_random_uuid(),
  commissioner_id uuid not null references users(id) on delete cascade,
  sleeper_league_id text not null unique,
  name text not null,
  season integer not null,
  league_size integer not null,
  scoring_format text not null,
  draft_format text not null default 'snake',
  rosters_per_team integer not null,
  positions jsonb not null default '{}'::jsonb,
  league_settings jsonb not null default '{}'::jsonb,
  draft_start_time timestamptz,
  draft_status text not null default 'setup',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create trigger set_leagues_updated_at
  before update on leagues
  for each row execute function set_updated_at();

-- ============================================================================
-- 3. draft_settings
-- ============================================================================

create table draft_settings (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null unique references leagues(id) on delete cascade,
  seconds_per_pick integer not null default 60,
  allow_pick_trading boolean not null default true,
  auto_draft_enabled boolean not null default false,
  auto_draft_type text not null default 'ffc_adp',
  commissioner_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_draft_settings_updated_at
  before update on draft_settings
  for each row execute function set_updated_at();

-- ============================================================================
-- 4. teams
-- ============================================================================

create table teams (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references leagues(id) on delete cascade,
  sleeper_user_id text,
  owner_id uuid references users(id) on delete set null,
  sleeper_team_name text not null,
  draft_house_team_name text not null,
  team_image_url text,
  custom_image_url text,
  draft_position integer not null,
  walk_up_song_url text,
  is_auto_draft boolean not null default false,
  family_league_wins integer not null default 0,
  team_anecdote text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_teams_updated_at
  before update on teams
  for each row execute function set_updated_at();

-- ============================================================================
-- 5. draft_state
-- ============================================================================

create table draft_state (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null unique references leagues(id) on delete cascade,
  current_pick_number integer not null default 1,
  current_team_id uuid references teams(id) on delete cascade,
  current_round integer not null default 1,
  timer_seconds integer not null default 60,
  timer_paused boolean not null default false,
  timer_active boolean not null default true,
  timer_started_at timestamptz,
  timer_restarted_at timestamptz,
  timer_expired boolean not null default false,
  timer_expired_at timestamptz,
  expired_team_id uuid references teams(id) on delete set null,
  pause_reason text,
  draft_started_at timestamptz,
  draft_ended_at timestamptz,
  draft_reset_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint draft_state_timer_seconds_check check (timer_seconds >= 0),
  constraint draft_state_current_round_check check (current_round >= 1)
);

create trigger set_draft_state_updated_at
  before update on draft_state
  for each row execute function set_updated_at();

-- ============================================================================
-- 6. picks
-- ============================================================================

create table picks (
  id uuid primary key default gen_random_uuid(),
  draft_state_id uuid not null references draft_state(id) on delete cascade,
  league_id uuid not null references leagues(id) on delete cascade,
  team_id uuid not null references teams(id) on delete cascade,
  sleeper_player_id text not null,
  player_name text not null,
  player_position text not null,
  player_nfl_team text,
  player_bye integer,
  pick_number integer not null,
  round integer not null,
  pick_order_in_round integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint picks_pick_number_check check (pick_number >= 1),
  constraint picks_round_check check (round >= 1),
  constraint picks_unique_player_per_league unique (league_id, sleeper_player_id)
);

create trigger set_picks_updated_at
  before update on picks
  for each row execute function set_updated_at();

-- ============================================================================
-- 7. direct_message_conversations
-- (created before direct_messages purely for FK dependency order; DATABASE.md
-- lists direct_messages first as table #8, this table as #9)
-- ============================================================================

create table direct_message_conversations (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references leagues(id) on delete cascade,
  user_a_id uuid not null references users(id) on delete cascade,
  user_b_id uuid not null references users(id) on delete cascade,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint dm_conversations_user_order_check check (user_a_id < user_b_id),
  constraint dm_conversations_unique_pair unique (league_id, user_a_id, user_b_id)
);

-- ============================================================================
-- 8. direct_messages
-- ============================================================================

create table direct_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references direct_message_conversations(id) on delete cascade,
  sender_id uuid not null references users(id) on delete cascade,
  recipient_id uuid not null references users(id) on delete cascade,
  content text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- 9. chat_messages
-- ============================================================================

create table chat_messages (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references leagues(id) on delete cascade,
  sender_id uuid references users(id) on delete cascade,
  message_type text not null,
  content text not null,
  pick_id uuid references picks(id) on delete cascade,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ============================================================================
-- 10. reactions
-- ============================================================================

create table reactions (
  id uuid primary key default gen_random_uuid(),
  pick_id uuid not null references picks(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  constraint reactions_unique_per_user_emoji unique (pick_id, user_id, emoji)
);

-- ============================================================================
-- 11. rosters
-- ============================================================================

create table rosters (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null unique references teams(id) on delete cascade,
  league_id uuid not null references leagues(id) on delete cascade,
  players jsonb not null default '[]'::jsonb,
  bench_count integer not null default 0,
  total_players integer not null default 0,
  last_updated timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- ============================================================================
-- 12. trade_offers
-- ============================================================================

create table trade_offers (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references leagues(id) on delete cascade,
  proposing_team_id uuid not null references teams(id) on delete cascade,
  receiving_team_id uuid not null references teams(id) on delete cascade,
  status text not null default 'proposed',
  proposed_by_user_id uuid not null references users(id) on delete cascade,
  accepted_by_user_id uuid references users(id) on delete cascade,
  message text,
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  completed_at timestamptz,
  deleted_at timestamptz
);

-- ============================================================================
-- 13. trade_offer_items
-- ============================================================================

create table trade_offer_items (
  id uuid primary key default gen_random_uuid(),
  trade_offer_id uuid not null references trade_offers(id) on delete cascade,
  from_team_id uuid not null references teams(id) on delete cascade,
  to_team_id uuid not null references teams(id) on delete cascade,
  item_type text not null,
  sleeper_player_id text,
  player_name text,
  draft_pick_id text,
  draft_pick_round integer,
  draft_pick_position integer,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- 14. draft_board
-- ============================================================================

create table draft_board (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references leagues(id) on delete cascade,
  pick_number integer not null,
  assigned_team_id uuid not null references teams(id) on delete cascade,
  status text not null default 'pending',
  pick_id uuid references picks(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint draft_board_unique_pick_slot unique (league_id, pick_number)
);

create trigger set_draft_board_updated_at
  before update on draft_board
  for each row execute function set_updated_at();

-- ============================================================================
-- 15. team_pick_assignments
-- ============================================================================

create table team_pick_assignments (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references leagues(id) on delete cascade,
  current_owner_team_id uuid not null references teams(id) on delete cascade,
  original_owner_team_id uuid not null references teams(id) on delete cascade,
  pick_number integer not null,
  round integer not null,
  position_in_round integer not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint team_pick_assignments_unique_pick_slot unique (league_id, pick_number)
);

create trigger set_team_pick_assignments_updated_at
  before update on team_pick_assignments
  for each row execute function set_updated_at();

-- ============================================================================
-- 16. user_preferences
-- (composite PK per DATABASE.md — no separate id column)
-- ============================================================================

create table user_preferences (
  user_id uuid not null references users(id) on delete cascade,
  league_id uuid not null references leagues(id) on delete cascade,
  show_pick_announcements boolean not null default true,
  show_trade_announcements boolean not null default true,
  auto_dismiss_announcements boolean not null default true,
  auto_dismiss_delay_ms integer not null default 3500,
  enable_announcement_sound boolean not null default true,
  announcement_volume double precision not null default 0.6,
  show_in_activity_feed boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, league_id),
  constraint user_preferences_volume_check check (announcement_volume >= 0 and announcement_volume <= 1)
);

create trigger set_user_preferences_updated_at
  before update on user_preferences
  for each row execute function set_updated_at();

-- ============================================================================
-- 17. draft_reset_archive
-- ============================================================================

create table draft_reset_archive (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references leagues(id) on delete cascade,
  reset_by_user_id uuid not null references users(id) on delete cascade,
  archived_picks jsonb not null default '[]'::jsonb,
  archived_messages jsonb not null default '[]'::jsonb,
  archived_reactions jsonb not null default '[]'::jsonb,
  archived_at timestamptz not null default now()
);

-- ============================================================================
-- 18. audio_events
-- ============================================================================

create table audio_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  league_id uuid not null references leagues(id) on delete cascade,
  event_type text not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);
