-- Indexes from docs/DATABASE.md's "Indexes" section, verbatim.

-- Lookups by user
create index idx_users_username on users(username);

-- Lookups by league
create index idx_leagues_commissioner_id on leagues(commissioner_id);
create index idx_leagues_sleeper_league_id on leagues(sleeper_league_id);
create index idx_leagues_draft_status on leagues(draft_status);

-- Lookups by team
create index idx_teams_league_id on teams(league_id);
create index idx_teams_owner_id on teams(owner_id);
create index idx_teams_draft_position on teams(league_id, draft_position);

-- Real-time subscriptions
create index idx_draft_state_league_id on draft_state(league_id);
create index idx_picks_league_id on picks(league_id);
create index idx_picks_team_id on picks(team_id);

-- Chat/messages
create index idx_chat_messages_league_id on chat_messages(league_id);
create index idx_chat_messages_created_at on chat_messages(league_id, created_at desc);
create index idx_direct_messages_conversation_id on direct_messages(conversation_id);
create index idx_direct_messages_recipient_read on direct_messages(recipient_id, read_at);
create index idx_direct_messages_conversation_read on direct_messages(conversation_id, read_at);
create index idx_reactions_pick_id on reactions(pick_id);

-- Rosters
create index idx_rosters_team_id on rosters(team_id);
create index idx_rosters_league_id on rosters(league_id);

-- Trade offers
create index idx_trade_offers_league_id on trade_offers(league_id);
create index idx_trade_offers_proposing_team_id on trade_offers(proposing_team_id);
create index idx_trade_offers_receiving_team_id on trade_offers(receiving_team_id);
create index idx_trade_offers_status on trade_offers(league_id, status);
create index idx_trade_offer_items_trade_offer_id on trade_offer_items(trade_offer_id);

-- Draft board
create index idx_draft_board_league_id on draft_board(league_id);
create index idx_draft_board_pick_number on draft_board(league_id, pick_number);
create index idx_draft_board_status on draft_board(league_id, status);
create index idx_draft_board_assigned_team on draft_board(league_id, assigned_team_id);

-- Team pick assignments
create index idx_team_pick_assignments_league_id on team_pick_assignments(league_id);
create index idx_team_pick_assignments_current_owner on team_pick_assignments(current_owner_team_id);
create index idx_team_pick_assignments_original_owner on team_pick_assignments(original_owner_team_id);
create index idx_team_pick_assignments_pick_number on team_pick_assignments(league_id, pick_number);

-- User preferences
create index idx_user_preferences_league_id on user_preferences(league_id);

-- Draft reset archive
create index idx_draft_reset_archive_league_id on draft_reset_archive(league_id);

-- Audio events
create index idx_audio_events_league_id on audio_events(league_id);
create index idx_audio_events_user_id on audio_events(user_id);
