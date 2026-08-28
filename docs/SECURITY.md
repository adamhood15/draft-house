# Security & Authorization

Split out of [REALTIME.md](REALTIME.md) — Row-Level Security policies, the service-role boundary, and the read-only-client rule for draft-mechanics tables.

## Security & Authorization

### Row-Level Security (RLS)

**Status**: Policy set defined below. Apply via a Supabase migration before the first real draft — until then, local dev can run with RLS off for speed.

**Core principle**: draft-mechanics tables are **SELECT-only for clients**. `draft_state`, `picks`, `draft_board`, `rosters`, and `team_pick_assignments` get no client-facing INSERT/UPDATE/DELETE policies at all — every write to them happens through server-side API routes using the Supabase service role key, which bypasses RLS by design. This matches the "Server Authority" principle in [AGENTS.md](../AGENTS.md) and is what actually prevents client-side pick manipulation, not application-layer checks alone.

**Helper functions** (used throughout the policies below):

```sql
-- True if the current user owns a team in this league, or is its commissioner
CREATE FUNCTION is_league_member(p_league_id uuid) RETURNS boolean AS $$
  SELECT EXISTS (SELECT 1 FROM teams WHERE league_id = p_league_id AND owner_id = auth.uid())
      OR EXISTS (SELECT 1 FROM leagues WHERE id = p_league_id AND commissioner_id = auth.uid());
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE FUNCTION is_commissioner(p_league_id uuid) RETURNS boolean AS $$
  SELECT EXISTS (SELECT 1 FROM leagues WHERE id = p_league_id AND commissioner_id = auth.uid());
$$ LANGUAGE sql SECURITY DEFINER STABLE;
```

**Draft-mechanics tables (read-only for clients)**:

```sql
CREATE POLICY draft_state_select ON draft_state FOR SELECT USING (is_league_member(league_id));
CREATE POLICY picks_select ON picks FOR SELECT USING (is_league_member(league_id));
CREATE POLICY draft_board_select ON draft_board FOR SELECT USING (is_league_member(league_id));
CREATE POLICY rosters_select ON rosters FOR SELECT USING (is_league_member(league_id));
CREATE POLICY team_pick_assignments_select ON team_pick_assignments FOR SELECT USING (is_league_member(league_id));
-- No write policies on any of the above — see "Core principle" note
```

**League & team tables**:

```sql
CREATE POLICY leagues_select ON leagues FOR SELECT USING (is_league_member(id));
CREATE POLICY leagues_update ON leagues FOR UPDATE USING (commissioner_id = auth.uid());

CREATE POLICY teams_select ON teams FOR SELECT USING (is_league_member(league_id));
CREATE POLICY teams_update ON teams FOR UPDATE USING (owner_id = auth.uid() OR is_commissioner(league_id));

CREATE POLICY draft_settings_select ON draft_settings FOR SELECT USING (is_league_member(league_id));
CREATE POLICY draft_settings_update ON draft_settings FOR UPDATE USING (is_commissioner(league_id));
```

**Chat & reactions** (public within a league):

```sql
CREATE POLICY chat_select ON chat_messages FOR SELECT USING (is_league_member(league_id));
CREATE POLICY chat_insert ON chat_messages FOR INSERT WITH CHECK (sender_id = auth.uid() AND is_league_member(league_id));

CREATE POLICY reactions_select ON reactions FOR SELECT USING (
  EXISTS (SELECT 1 FROM picks WHERE picks.id = reactions.pick_id AND is_league_member(picks.league_id))
);
CREATE POLICY reactions_insert ON reactions FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY reactions_delete ON reactions FOR DELETE USING (user_id = auth.uid());
```

**Direct messages** (private to the two participants):

```sql
CREATE POLICY dm_conversations_select ON direct_message_conversations
  FOR SELECT USING (user_a_id = auth.uid() OR user_b_id = auth.uid());

CREATE POLICY dm_select ON direct_messages
  FOR SELECT USING (sender_id = auth.uid() OR recipient_id = auth.uid());

CREATE POLICY dm_insert ON direct_messages
  FOR INSERT WITH CHECK (sender_id = auth.uid());
```

**Trades** (visible and mutable only by the two teams involved, or the commissioner — `trade_offers` and `trade_offer_items` are written directly from the client per [DRAFT_ENGINE.md](DRAFT_ENGINE.md#trade-offers)'s `createTradeOffer`/`acceptTrade` calls, so unlike the draft-mechanics tables above, these need real write policies, not just SELECT):

```sql
CREATE POLICY trade_offers_select ON trade_offers FOR SELECT USING (
  is_commissioner(league_id) OR
  EXISTS (
    SELECT 1 FROM teams
    WHERE teams.id IN (proposing_team_id, receiving_team_id) AND teams.owner_id = auth.uid()
  )
);

-- Only the proposing team's owner can open a trade, and only as themselves
CREATE POLICY trade_offers_insert ON trade_offers FOR INSERT WITH CHECK (
  proposed_by_user_id = auth.uid() AND
  EXISTS (SELECT 1 FROM teams WHERE teams.id = proposing_team_id AND teams.owner_id = auth.uid())
);

-- Either team's owner (accept/reject/withdraw) or the commissioner (undo) can update a trade
CREATE POLICY trade_offers_update ON trade_offers FOR UPDATE USING (
  is_commissioner(league_id) OR
  EXISTS (SELECT 1 FROM teams WHERE teams.id = proposing_team_id AND teams.owner_id = auth.uid()) OR
  EXISTS (SELECT 1 FROM teams WHERE teams.id = receiving_team_id AND teams.owner_id = auth.uid())
);

CREATE POLICY trade_offer_items_select ON trade_offer_items FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM trade_offers
    WHERE trade_offers.id = trade_offer_items.trade_offer_id
      AND (
        is_commissioner(trade_offers.league_id) OR
        EXISTS (
          SELECT 1 FROM teams
          WHERE teams.id IN (trade_offers.proposing_team_id, trade_offers.receiving_team_id)
            AND teams.owner_id = auth.uid()
        )
      )
  )
);

-- Items are inserted in the same transaction as their parent trade_offers row,
-- by the same proposing user
CREATE POLICY trade_offer_items_insert ON trade_offer_items FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM trade_offers
    WHERE trade_offers.id = trade_offer_id AND trade_offers.proposed_by_user_id = auth.uid()
  )
);
```

**Preferences & analytics** (private to the owning user):

```sql
CREATE POLICY user_prefs_all ON user_preferences FOR ALL USING (user_id = auth.uid());
CREATE POLICY audio_events_insert ON audio_events FOR INSERT WITH CHECK (user_id = auth.uid());
-- draft_reset_archive: no client policies at all — commissioner-only, read via service role if ever needed
```

**Users**:

```sql
CREATE POLICY users_select ON users FOR SELECT USING (true); -- needed for display_name/avatar across rosters & chat
CREATE POLICY users_update_self ON users FOR UPDATE USING (id = auth.uid());
```

---

