# Real-Time Synchronization

This document describes how Draft House uses Supabase Realtime for live draft updates across all connected clients.

## Overview

Supabase Realtime uses PostgreSQL's built-in change notifications to broadcast database changes to subscribed clients via WebSocket.

**Key concept**: When a row is inserted, updated, or deleted, all clients subscribed to that table receive a real-time event.

---

## Technology: Supabase Realtime

### How It Works

```
Database                  Supabase Realtime          Clients
  (PostgreSQL)            (WebSocket broker)         (Browsers)

INSERT pick
  ↓
Trigger sends notification → WebSocket server → Broadcast to subscribers
                                                   ├── Client A
                                                   ├── Client B
                                                   └── Client C
```

### Connection

```javascript
// Client subscribes to real-time changes
const subscription = supabase
  .channel('public:picks')
  .on(
    'postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'picks' },
    (payload) => {
      console.log('New pick:', payload.new);
    }
  )
  .subscribe();
```

---

## Events

### 1. Draft State Change

**When**: Timer updated, draft paused/resumed, pick advanced

```javascript
supabase
  .channel(`draft:${league_id}`)
  .on(
    'postgres_changes',
    { 
      event: 'UPDATE', 
      schema: 'public', 
      table: 'draft_state',
      filter: `league_id=eq.${league_id}`
    },
    (payload) => {
      const { current_pick_number, timer_seconds, timer_paused } = payload.new;
      updateUI({ timer_seconds, timer_paused });
      highlightCurrentTeam(current_pick_number);
    }
  )
  .subscribe();
```

**Broadcast**: Whenever `draft_state` changes

**Example event**:
```json
{
  "type": "UPDATE",
  "table": "draft_state",
  "schema": "public",
  "new": {
    "league_id": "league_123",
    "current_pick_number": 2,
    "current_team_id": "team_2",
    "timer_seconds": 45,
    "timer_paused": false
  },
  "old": {
    "league_id": "league_123",
    "current_pick_number": 1,
    "current_team_id": "team_1",
    "timer_seconds": 60,
    "timer_paused": false
  }
}
```

---

### 2. Pick Made

**When**: Player is drafted

```javascript
supabase
  .channel(`picks:${league_id}`)
  .on(
    'postgres_changes',
    { 
      event: 'INSERT', 
      schema: 'public', 
      table: 'picks',
      filter: `league_id=eq.${league_id}`
    },
    (payload) => {
      const { team_id, player_name, player_position } = payload.new;
      addToActivityFeed(`${getTeamName(team_id)} drafted ${player_name}`);
      updateTeamRoster(team_id, payload.new);
      playDraftChime();
    }
  )
  .subscribe();
```

**Broadcast**: Whenever a pick is inserted

**Example event**:
```json
{
  "type": "INSERT",
  "table": "picks",
  "schema": "public",
  "new": {
    "id": "pick_456",
    "league_id": "league_123",
    "team_id": "team_1",
    "sleeper_player_id": "2222",
    "player_name": "Bijan Robinson",
    "player_position": "RB",
    "player_nfl_team": "ATL",
    "player_bye": 10,
    "pick_number": 1,
    "round": 1,
    "created_at": "2025-09-04T14:32:15Z"
  }
}
```

---

### 3. Chat Message / Activity Update

**When**: User sends message, commissioner performs action, pick announced

```javascript
supabase
  .channel(`chat:${league_id}`)
  .on(
    'postgres_changes',
    { 
      event: 'INSERT', 
      schema: 'public', 
      table: 'chat_messages',
      filter: `league_id=eq.${league_id}`
    },
    (payload) => {
      const { sender_id, message_type, content } = payload.new;
      
      if (message_type === 'pick') {
        // Auto-generated pick announcement
        addPickToActivityFeed(payload.new);
      } else if (message_type === 'message') {
        // User chat message
        addChatMessage(payload.new);
      } else if (message_type === 'system') {
        // System notification (draft paused, etc.)
        addSystemNotification(payload.new);
      }
    }
  )
  .subscribe();
```

**Broadcast**: Whenever a message is inserted

**Example event** (user message):
```json
{
  "type": "INSERT",
  "table": "chat_messages",
  "schema": "public",
  "new": {
    "id": "msg_789",
    "league_id": "league_123",
    "sender_id": "user_456",
    "message_type": "message",
    "content": "What were you thinking!?",
    "created_at": "2025-09-04T14:32:45Z"
  }
}
```

---

### 4. Emoji Reaction

**When**: User reacts to a pick

```javascript
supabase
  .channel(`reactions:${league_id}`)
  .on(
    'postgres_changes',
    { 
      event: 'INSERT', 
      schema: 'public', 
      table: 'reactions',
      filter: `league_id=eq.${league_id}`
    },
    (payload) => {
      const { pick_id, emoji, user_id } = payload.new;
      addReactionToPick(pick_id, emoji);
      updateReactionCount(pick_id);
    }
  )
  .subscribe();
```

**Broadcast**: Whenever a reaction is inserted

**Example event**:
```json
{
  "type": "INSERT",
  "table": "reactions",
  "schema": "public",
  "new": {
    "id": "reaction_123",
    "pick_id": "pick_456",
    "user_id": "user_789",
    "emoji": "🔥",
    "created_at": "2025-09-04T14:33:00Z"
  }
}
```

---

### 5. Direct Message

**When**: User sends private message

```javascript
supabase
  .channel(`dm:${conversation_id}`)
  .on(
    'postgres_changes',
    { 
      event: 'INSERT', 
      schema: 'public', 
      table: 'direct_messages',
      filter: `conversation_id=eq.${conversation_id}`
    },
    (payload) => {
      const { sender_id, content } = payload.new;
      addMessageToConversation(payload.new);
    }
  )
  .subscribe();
```

**Broadcast**: Only to conversation participants

**Example event**:
```json
{
  "type": "INSERT",
  "table": "direct_messages",
  "schema": "public",
  "new": {
    "id": "dm_999",
    "conversation_id": "conv_123",
    "sender_id": "user_456",
    "recipient_id": "user_789",
    "content": "Would you trade your 4th for my 6th?",
    "created_at": "2025-09-04T14:35:00Z",
    "read_at": null
  }
}
```

---

### 6. Team Claiming

**When**: User claims a team

```javascript
supabase
  .channel(`teams:${league_id}`)
  .on(
    'postgres_changes',
    { 
      event: 'UPDATE', 
      schema: 'public', 
      table: 'teams',
      filter: `league_id=eq.${league_id}`
    },
    (payload) => {
      if (payload.new.owner_id !== payload.old.owner_id) {
        // Team claimed
        updateTeamDisplay(payload.new);
        addSystemMessage(`${payload.new.owner_id} claimed ${payload.new.draft_house_team_name}`);
      }
    }
  )
  .subscribe();
```

**Broadcast**: All clients in league see team claim in real-time

---

## Subscription Patterns

### Pattern 1: League-Wide Updates

Subscribe to all draft events for a league:

```javascript
const setupLeagueSubscriptions = (league_id) => {
  // All events within this league
  supabase
    .channel(`league:${league_id}`)
    .on('postgres_changes', 
      { 
        event: '*',  // All events
        schema: 'public',
        filter: `league_id=eq.${league_id}`
      },
      (payload) => handleLeagueUpdate(payload)
    )
    .subscribe();
};
```

### Pattern 2: Table-Specific Subscriptions

Subscribe to specific table changes:

```javascript
const setupPickSubscriptions = (league_id) => {
  supabase
    .channel(`picks:${league_id}`)
    .on('postgres_changes',
      { 
        event: 'INSERT',
        schema: 'public',
        table: 'picks',
        filter: `league_id=eq.${league_id}`
      },
      (payload) => handleNewPick(payload.new)
    )
    .subscribe();
};
```

### Pattern 3: Conversation-Specific (Direct Messages)

```javascript
const setupDMSubscription = (conversation_id) => {
  supabase
    .channel(`dm:${conversation_id}`)
    .on('postgres_changes',
      { 
        event: 'INSERT',
        schema: 'public',
        table: 'direct_messages',
        filter: `conversation_id=eq.${conversation_id}`
      },
      (payload) => addDMToUI(payload.new)
    )
    .subscribe();
};
```

---

## Client-Side State Management

### React Example

```javascript
// Custom hook for draft state updates
const useDraftState = (league_id) => {
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Initial load
    fetchDraftState(league_id).then(setDraft);

    // Subscribe to updates
    const channel = supabase
      .channel(`draft:${league_id}`)
      .on('postgres_changes',
        { 
          event: 'UPDATE',
          schema: 'public',
          table: 'draft_state',
          filter: `league_id=eq.${league_id}`
        },
        (payload) => setDraft(payload.new)
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [league_id]);

  return { draft, loading };
};
```

---

## Debouncing High-Frequency Events

**Problem**: Timer ticks every 100ms, but we don't need to broadcast every tick

**Solution**: Debounce or batch updates

```javascript
// Only send timer update every 1 second
const updateTimerDebounced = debounce(() => {
  database.updateDraftState({
    timer_seconds: currentTime
  });
}, 1000);

// Every 100ms locally, but database updates every 1s
const timerInterval = setInterval(() => {
  currentTime -= 0.1;
  updateLocalDisplay(currentTime);
  updateTimerDebounced();
}, 100);
```

**Alternative**: Calculate remaining time on client from server timestamp

```javascript
// Server sends: timer_started_at, timer_total_seconds
// Client calculates: remaining = timer_total_seconds - (now - timer_started_at)

// Updates only when state changes (paused, reset, etc.), not continuously
```

---

## Error Handling & Reconnection

### Subscription Failures

```javascript
const setupSubscription = (league_id) => {
  const channel = supabase
    .channel(`league:${league_id}`)
    .on('postgres_changes', {...}, (payload) => handleUpdate(payload))
    .subscribe((status, err) => {
      if (status === 'SUBSCRIBED') {
        console.log('Real-time connected');
      } else if (status === 'CHANNEL_ERROR') {
        console.error('Subscription error:', err);
        // Retry logic
        setTimeout(() => setupSubscription(league_id), 5000);
      }
    });

  return channel;
};
```

### Network Loss

Supabase Realtime automatically reconnects. When reconnected:

```javascript
channel.on('*', (payload) => {
  // Resume updates (this fires when connection restored)
})
```

**Recommendation**: On reconnect, refetch full state from server to catch any missed updates.

```javascript
channel.subscribe((status) => {
  if (status === 'SUBSCRIBED') {
    // Reconnected after outage
    refetchDraftState();  // Full state refresh
  }
});
```

---

## Performance & Scalability

### Broadcast Size

Real-time events include full row data (INSERT/UPDATE) and old row data (UPDATE). Keep rows lean:

- ✅ Store core data in database
- ❌ Don't store large JSON blobs in frequently-updated rows
- ✅ Reference lookups separately

### Subscription Scope

Use filters to reduce unnecessary broadcasts:

```javascript
// Good: Only events for this league
filter: `league_id=eq.${league_id}`

// Bad: All picks across all leagues (inefficient)
// No filter
```

### Concurrent Connections

Each client maintains a WebSocket connection. For 12 participants:
- 12 WebSocket connections
- Minimal bandwidth per event (JSON payload ~500 bytes)
- Supabase handles routing

---

## Testing Real-Time Events

### Manual Testing

```javascript
// In browser console
const channel = supabase
  .channel('test')
  .on('postgres_changes',
    { event: '*', schema: 'public', table: 'picks' },
    (payload) => console.log('Received:', payload)
  )
  .subscribe();

// In database, run:
// INSERT INTO picks (...) VALUES (...)
// You should see the event logged
```

### Unit Testing

```javascript
// Mock Supabase real-time
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    channel: jest.fn(() => ({
      on: jest.fn(function() { return this; }),
      subscribe: jest.fn()
    }))
  }))
}));

// Test that handlers are registered
test('subscribes to pick updates', () => {
  useDraftState('league_123');
  
  expect(supabase.channel).toHaveBeenCalledWith('draft:league_123');
  expect(channel.on).toHaveBeenCalledWith(
    'postgres_changes',
    expect.objectContaining({ event: 'UPDATE' }),
    expect.any(Function)
  );
});
```

---

## Rate Limiting & Abuse Prevention

**Decision**: Enforce limits at the database level via Postgres `BEFORE INSERT` trigger functions, not application code. Chat, DM, and reaction inserts happen directly from the client via supabase-js (see [CHAT.md](CHAT.md)), so a client-side-only check could just be skipped by calling the API differently — a trigger that counts each user's recent rows and raises an exception is enforced no matter how the insert is made.

| Action | Limit | Rationale |
|---|---|---|
| Chat messages (`chat_messages`, `message_type = 'message'`) | 20 per user per minute | Generous enough for excited trash-talk during a pick, tight enough to stop a runaway client bug or someone mashing send |
| Direct messages (`direct_messages`) | 20 per user per minute | Same reasoning as chat |
| Reactions per pick (`reactions`) | 5 distinct emoji per user per pick | The unique `(pick_id, user_id, emoji)` constraint already blocks duplicate identical reactions; this caps how many *different* emoji one person can stack onto a single pick out of the ~12-emoji default palette |
| Reaction inserts/deletes (toggling) | 30 per user per minute, across all picks | Stops rapid on/off spam-clicking |
| Commissioner actions (pause, undo, edit timer, manual pick, reset) | Not rate-limited | Trusted role, infrequent by nature, and rate-limiting these risks blocking a commissioner mid-crisis |

**Example trigger** (same pattern applies to `direct_messages` and `reactions`, swapping the counted condition per the table above):

```sql
CREATE OR REPLACE FUNCTION enforce_chat_rate_limit() RETURNS trigger AS $$
BEGIN
  IF (
    SELECT COUNT(*) FROM chat_messages
    WHERE sender_id = NEW.sender_id
      AND message_type = 'message'
      AND created_at > now() - interval '1 minute'
  ) >= 20 THEN
    RAISE EXCEPTION 'Rate limit exceeded: max 20 messages per minute';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER chat_rate_limit
  BEFORE INSERT ON chat_messages
  FOR EACH ROW
  WHEN (NEW.message_type = 'message')
  EXECUTE FUNCTION enforce_chat_rate_limit();
```

---

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

## Debugging Real-Time Issues

### Check Connection Status

```javascript
const channel = supabase.channel('test');
channel.subscribe((status) => {
  console.log('Channel status:', status);
  // SUBSCRIBED | CHANNEL_ERROR | TIMED_OUT | CLOSED
});
```

### Monitor Network Traffic

In Chrome DevTools:
1. Open DevTools → Network tab
2. Filter by "ws" (WebSocket)
3. Look for wss://message-XXXX.supabase.co
4. Check messages sent/received

### Logs

```javascript
supabase.realtime.setAuth(token);  // If auth needed
supabase.realtime.debug = true;    // Enable debug logs
```

---

## See Also

- [DATABASE.md](DATABASE.md) — Table schema and structure
- [DRAFT_ENGINE.md](DRAFT_ENGINE.md) — Draft logic that triggers events
- [CHAT.md](CHAT.md) — Chat implementation using real-time
- [ARCHITECTURE.md](../ARCHITECTURE.md) — Overall system design
- [AGENTS.md](../AGENTS.md) — Project overview
