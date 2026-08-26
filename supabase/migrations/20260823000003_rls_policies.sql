-- Row-level security. Source of truth: docs/REALTIME.md "Security & Authorization".
-- Core principle: draft-mechanics tables (draft_state, picks, draft_board, rosters,
-- team_pick_assignments) get RLS enabled with ONLY a select policy — every write to
-- them happens server-side via the service-role client (src/lib/supabase/admin.ts),
-- which bypasses RLS entirely. draft_reset_archive gets RLS enabled with no client
-- policies at all.

alter table users enable row level security;
alter table leagues enable row level security;
alter table draft_settings enable row level security;
alter table teams enable row level security;
alter table draft_state enable row level security;
alter table picks enable row level security;
alter table chat_messages enable row level security;
alter table direct_message_conversations enable row level security;
alter table direct_messages enable row level security;
alter table reactions enable row level security;
alter table rosters enable row level security;
alter table trade_offers enable row level security;
alter table trade_offer_items enable row level security;
alter table draft_board enable row level security;
alter table team_pick_assignments enable row level security;
alter table user_preferences enable row level security;
alter table draft_reset_archive enable row level security;
alter table audio_events enable row level security;

-- ============================================================================
-- Helper functions
-- ============================================================================

create or replace function is_league_member(p_league_id uuid) returns boolean as $$
  select exists (select 1 from teams where league_id = p_league_id and owner_id = auth.uid())
      or exists (select 1 from leagues where id = p_league_id and commissioner_id = auth.uid());
$$ language sql security definer stable;

create or replace function is_commissioner(p_league_id uuid) returns boolean as $$
  select exists (select 1 from leagues where id = p_league_id and commissioner_id = auth.uid());
$$ language sql security definer stable;

-- ============================================================================
-- Draft-mechanics tables (read-only for clients — see header note)
-- ============================================================================

create policy draft_state_select on draft_state for select using (is_league_member(league_id));
create policy picks_select on picks for select using (is_league_member(league_id));
create policy draft_board_select on draft_board for select using (is_league_member(league_id));
create policy rosters_select on rosters for select using (is_league_member(league_id));
create policy team_pick_assignments_select on team_pick_assignments for select using (is_league_member(league_id));

-- ============================================================================
-- League & team tables
-- ============================================================================

create policy leagues_select on leagues for select using (is_league_member(id));
create policy leagues_update on leagues for update using (commissioner_id = auth.uid());

create policy teams_select on teams for select using (is_league_member(league_id));
create policy teams_update on teams for update using (owner_id = auth.uid() or is_commissioner(league_id));

create policy draft_settings_select on draft_settings for select using (is_league_member(league_id));
create policy draft_settings_update on draft_settings for update using (is_commissioner(league_id));

-- ============================================================================
-- Chat & reactions (public within a league)
-- ============================================================================

create policy chat_select on chat_messages for select using (is_league_member(league_id));
create policy chat_insert on chat_messages for insert with check (sender_id = auth.uid() and is_league_member(league_id));

create policy reactions_select on reactions for select using (
  exists (select 1 from picks where picks.id = reactions.pick_id and is_league_member(picks.league_id))
);
create policy reactions_insert on reactions for insert with check (user_id = auth.uid());
create policy reactions_delete on reactions for delete using (user_id = auth.uid());

-- ============================================================================
-- Direct messages (private to the two participants)
-- ============================================================================

create policy dm_conversations_select on direct_message_conversations
  for select using (user_a_id = auth.uid() or user_b_id = auth.uid());

create policy dm_select on direct_messages
  for select using (sender_id = auth.uid() or recipient_id = auth.uid());

create policy dm_insert on direct_messages
  for insert with check (sender_id = auth.uid());

-- ============================================================================
-- Trades (visible and mutable only by the two teams involved, or the commissioner)
-- ============================================================================

create policy trade_offers_select on trade_offers for select using (
  is_commissioner(league_id) or
  exists (
    select 1 from teams
    where teams.id in (proposing_team_id, receiving_team_id) and teams.owner_id = auth.uid()
  )
);

create policy trade_offers_insert on trade_offers for insert with check (
  proposed_by_user_id = auth.uid() and
  exists (select 1 from teams where teams.id = proposing_team_id and teams.owner_id = auth.uid())
);

create policy trade_offers_update on trade_offers for update using (
  is_commissioner(league_id) or
  exists (select 1 from teams where teams.id = proposing_team_id and teams.owner_id = auth.uid()) or
  exists (select 1 from teams where teams.id = receiving_team_id and teams.owner_id = auth.uid())
);

create policy trade_offer_items_select on trade_offer_items for select using (
  exists (
    select 1 from trade_offers
    where trade_offers.id = trade_offer_items.trade_offer_id
      and (
        is_commissioner(trade_offers.league_id) or
        exists (
          select 1 from teams
          where teams.id in (trade_offers.proposing_team_id, trade_offers.receiving_team_id)
            and teams.owner_id = auth.uid()
        )
      )
  )
);

create policy trade_offer_items_insert on trade_offer_items for insert with check (
  exists (
    select 1 from trade_offers
    where trade_offers.id = trade_offer_id and trade_offers.proposed_by_user_id = auth.uid()
  )
);

-- ============================================================================
-- Preferences & analytics (private to the owning user)
-- ============================================================================

create policy user_prefs_all on user_preferences for all using (user_id = auth.uid());
create policy audio_events_insert on audio_events for insert with check (user_id = auth.uid());
-- draft_reset_archive: no client policies at all — commissioner-only, read via service role if ever needed

-- ============================================================================
-- Users
-- ============================================================================

create policy users_select on users for select using (true); -- needed for display_name/avatar across rosters & chat
create policy users_update_self on users for update using (id = auth.uid());
