# Trades

Split out of [DRAFT_ENGINE.md](DRAFT_ENGINE.md) — trade types, proposal flow, validation, roster synchronization, and trade lifecycle.

> NOTE: `trade_offers` and `trade_offer_items` are the only draft-path tables written directly from
> the client. Every other draft-mechanics table is service-role only. See [SECURITY.md](SECURITY.md).

## Trade Offers

### Overview

Trade offers allow teams to exchange players and draft picks during the draft. A trade is a multi-sided transaction where one team proposes giving certain players/picks and receiving certain players/picks from another team.

### Trade Types

**v1 scope**: 2-team trades only, with propose → accept/reject/withdraw. No counter-offers in v1 (see [Counter-Offers (Future)](#counter-offers-future) below) and no multi-team trades.

**2-Team Trade (MVP)**:
```
Team A gives: Player X, Player Y
Team A gets: Player Z, Pick 2.05

Team B gives: Player Z, Pick 2.05
Team B gets: Player X, Player Y
```

**Multi-Team Trades (Future)**:
```
Team A gives: Players X, Y
Team B gives: Players Z
Team C gives: Pick 1.10
  ↓
Team A gets: Players Z, Pick 1.10
Team B gets: Players X, Y
Team C gets: nothing (TBD)
```

### Trade Proposal Flow

**Step 1: Initiate Trade**

```
Team A owner opens Commissioner/Trade UI
    ↓
Selects "Propose Trade"
    ↓
Chooses Team B as trading partner
    ↓
Selects players/picks to give
    ↓
Selects players/picks to receive
    ↓
Writes optional message ("This improves both our rosters")
    ↓
Clicks "Send Proposal"
```

**Database**:
```javascript
const createTradeOffer = async (league_id, proposing_team_id, receiving_team_id, message) => {
  const { data, error } = await supabase
    .from('trade_offers')
    .insert({
      league_id,
      proposing_team_id,
      receiving_team_id,
      status: 'proposed',  // proposed → accepted/rejected/withdrawn
      message,
      created_at: now(),
      expires_at: now() + 7 days  // Optional: auto-reject if not responded
    });
  
  return data[0];
};
```

**Step 2: Recipient Reviews**

```
Team B owner receives notification
    ↓
Clicks notification (or navigates to Trades)
    ↓
Sees trade details:
  ├─ Team A gives: [Player cards]
  ├─ Team B gives: [Player cards]
  ├─ Proposal message
  └─ Buttons: Accept / Reject / Counter
```

**Step 3: Accept or Reject**

```
Team B clicks "Accept"
    ↓
Server validates trade (see Validation below)
    ↓
If validation returns warnings (roster forfeits needed):
    ├─ Show warning to Team B: "This trade will require you to forfeit X pick(s)"
    ├─ Allow Team B to proceed (click "Accept Anyway") or cancel
    └─ If proceed:
        └─ Continue to execution
    
If no warnings (trade fits within roster limits):
    └─ Continue to execution
    ↓
EXECUTION PHASE:
    ↓
UPDATE trade_offers SET status = 'accepted', accepted_at = now()
    ↓
Execute roster updates:
    DELETE players from Team A's roster
    INSERT players to Team B's roster
    ... (vice versa for Team B)
    ↓
UPDATE rosters table with new player lists
    ↓
Realtime event: trade_completed
    ↓
Both teams notified: "Trade accepted!"
    ↓
If forfeit warnings were shown:
    └─ Both teams see: "Team B will forfeit their last X pick(s) to stay within roster limits"
```

### Trade Validation

Before accepting a trade, server validates:

**simulateRosterAfterTrade Function**:

This function calculates the total roster size a team would have after a trade completes:

```javascript
const simulateRosterAfterTrade = (current_roster, give_items, receive_items) => {
  // Current roster has: current_roster.length players already drafted
  
  // Count players/picks being given away
  const players_being_given = give_items.filter(item => item.player_id).length;
  const picks_being_given = give_items.filter(item => item.pick_id).length;
  
  // Count players/picks being received
  const players_being_received = receive_items.filter(item => item.player_id).length;
  const picks_being_received = receive_items.filter(item => item.pick_id).length;
  
  // Calculate net change
  const net_change = (players_being_received + picks_being_received) - (players_being_given + picks_being_given);
  
  // Return total roster size after trade
  return current_roster.length + net_change;
};
```

**Example**:
- Team A has 8 drafted players
- Team A gives: 2 picks (counts as 2 future roster spots)
- Team A receives: 1 pick (counts as 1 future roster spot)
- Total after trade: 8 + (1 - 2) = 7 drafted players + 1 pending pick = 8 total

**Validation Code**:

Trade validation verifies that each team actually owns the assets they're trading away. This is the ONLY hard rejection rule. Roster limit violations are warnings only.

```javascript
const validateTrade = async (trade_offer_id) => {
  const trade = await getTrade(trade_offer_id);
  const team_a_id = trade.proposing_team_id;
  const team_b_id = trade.receiving_team_id;
  
  // Roster limit comes from the league's own settings, not a hardcoded value —
  // leagues.rosters_per_team reflects whatever roster construction was imported/edited at setup
  const league = await getLeague(trade.league_id);
  const roster_limit = league.rosters_per_team;
  
  // Get current rosters for both teams
  const team_a_roster = await getTeamRoster(team_a_id);
  const team_b_roster = await getTeamRoster(team_b_id);
  
  // Get picks each team currently owns
  const team_a_picks = await getTeamOwnedPicks(team_a_id);
  const team_b_picks = await getTeamOwnedPicks(team_b_id);
  
  // ===== CHECK 1: Does Team A have all players/picks they're giving away? =====
  for (const item of trade.give) {
    if (item.player_id) {
      // Verify Team A has this player in their roster
      const hasPlayer = team_a_roster.players.some(p => p.sleeper_player_id === item.player_id);
      if (!hasPlayer) {
        throw new Error(`Team A does not have ${item.player_name}. This player may have been traded or dropped.`);
      }
    }
    
    if (item.pick_id) {
      // Verify Team A owns this pick (current ownership, not original)
      const ownsPick = team_a_picks.some(p => p.id === item.pick_id);
      if (!ownsPick) {
        throw new Error(`Team A does not own that draft pick. It may have been traded.`);
      }
    }
  }
  
  // ===== CHECK 2: Does Team B have all players/picks they're giving away? =====
  for (const item of trade.receive) {
    if (item.player_id) {
      // Verify Team B has this player in their roster
      const hasPlayer = team_b_roster.players.some(p => p.sleeper_player_id === item.player_id);
      if (!hasPlayer) {
        throw new Error(`Team B does not have ${item.player_name}. This player may have been traded or dropped.`);
      }
    }
    
    if (item.pick_id) {
      // Verify Team B owns this pick (current ownership, not original)
      const ownsPick = team_b_picks.some(p => p.id === item.pick_id);
      if (!ownsPick) {
        throw new Error(`Team B does not own that draft pick. It may have been traded.`);
      }
    }
  }
  
  // ===== CHECK 3: Warn if roster limits will be exceeded (but allow it) =====
  const team_a_new_size = simulateRosterAfterTrade(team_a_roster, trade.give, trade.receive);
  const team_b_new_size = simulateRosterAfterTrade(team_b_roster, trade.receive, trade.give);
  
  const warnings = {};
  
  if (team_a_new_size > roster_limit) {
    const forfeits_needed = team_a_new_size - roster_limit;
    warnings.team_a = `Your roster will have ${team_a_new_size} players after this trade. Your league limit is ${roster_limit} players. You will need to forfeit your last ${forfeits_needed} pick(s) to stay within the limit.`;
  }
  
  if (team_b_new_size > roster_limit) {
    const forfeits_needed = team_b_new_size - roster_limit;
    warnings.team_b = `Your roster will have ${team_b_new_size} players after this trade. Your league limit is ${roster_limit} players. You will need to forfeit your last ${forfeits_needed} pick(s) to stay within the limit.`;
  }
  
  // All asset ownership checks pass - trade is valid
  // Return any warnings about roster limits (warnings do NOT block the trade)
  return {
    valid: true,
    warnings: Object.keys(warnings).length > 0 ? warnings : null
  };
};
```

**Key Points**:
- **Check 1**: Verify Team A owns all players/picks they're giving away (reject if not)
- **Check 2**: Verify Team B owns all players/picks they're giving away (reject if not)
- **Check 3**: Calculate final roster sizes and warn if over limit (but allow trade to proceed)
- Roster limit violations are **warnings only**, not rejections
- Teams that go over the limit will automatically forfeit their final picks to stay compliant

### Roster Synchronization After Trade

When a trade is accepted, the `rosters` denormalized table must be updated immediately so all clients see the new player lists.

**Database Update**:

```sql
-- After trade acceptance, update rosters table
UPDATE rosters
SET players = jsonb_set(
  players,
  '{players}',
  (SELECT jsonb_agg(jsonb_build_object(...))
   FROM draft_picks
   WHERE team_id = team_a_id AND league_id = league_id)
)
WHERE team_id = team_a_id AND league_id = league_id;

-- Same for Team B
```

**Real-Time Event**:

```javascript
// Supabase Realtime broadcasts roster update
supabase
  .channel(`rosters:${league_id}`)
  .on('postgres_changes',
    {
      event: 'UPDATE',
      schema: 'public',
      table: 'rosters',
      filter: `league_id=eq.${league_id}`
    },
    (payload) => {
      // Client updates UI: team rosters show new players
      updateTeamRoster(payload.new.team_id, payload.new.players);
    }
  )
  .subscribe();
```

### Trade Notifications & Popup Display

When a trade is accepted, all players in the draft receive an immediate notification with details of the trade.

#### Real-Time Trade Broadcast

When a trade is executed, the draft is paused and a real-time event is broadcast to all connected clients in the draft:

```javascript
// After trade is successfully executed
const broadcastTradeCompletion = async (league_id, trade_offer_id) => {
  // STEP 1: Pause draft immediately (same as pick announcement)
  await supabase
    .from('drafts')
    .update({ timer_paused: true, pause_reason: 'trade_in_progress' })
    .eq('league_id', league_id);
  
  // STEP 2: Broadcast trade_completed event to all clients in this league
  supabase
    .channel(`trades:${league_id}`)
    .send({
      type: 'broadcast',
      event: 'trade_completed',
      payload: {
        trade_id: trade_offer_id,
        proposing_team_id: team_a_id,
        proposing_team_name: team_a_name,
        receiving_team_id: team_b_id,
        receiving_team_name: team_b_name,
        items_given: [
          {
            type: 'player',
            name: 'Bijan Robinson',
            position: 'RB',
            team: 'ATL'
          },
          {
            type: 'pick',
            round: 4,
            position: 5,
            display: '4.05'
          }
        ],
        items_received: [
          {
            type: 'player',
            name: 'Garrett Wilson',
            position: 'WR',
            team: 'NYJ'
          }
        ],
        timestamp: now()
      }
    });
  
  // STEP 3: Resume draft after trade animation completes (3-4 seconds)
  setTimeout(async () => {
    await supabase
      .from('drafts')
      .update({ timer_paused: false })
      .eq('league_id', league_id);
    
    // Broadcast animation complete event
    supabase.channel(`trades:${league_id}`).send({
      type: 'broadcast',
      event: 'trade_animation_complete',
      payload: {}
    });
  }, 3500); // 3.5 second animation sequence
};
```

#### Trade Announcement Sequence

The trade announcement follows a two-phase sequence similar to pick announcements:

```
1. Trade executed on server
    ↓
2. Server pauses draft timer
    ↓
3. Broadcast trade_completed event to all clients
    ↓
4. All clients show Phase 1: "A TRADE HAS BEEN MADE" popup
    ↓
5. Activity feed shows: "A trade has been made"
    ↓
6. After 1.5 seconds, update popup to Phase 2:
   Show two-card layout with trade details
    - Card A: [Team A Name] receives [assets from Team B]
    - Card B: [Team B Name] receives [assets from Team A]
    ↓
7. Activity feed shows detailed message with full trade details
    ↓
8. Players can immediately react to activity feed entries
    ↓
9. After 3.5 seconds total: Close popup
    ↓
10. Resume timer for current team
```

#### Client-Side Trade Notification Subscription

All clients subscribe to trade completion events and pause the draft display:

```javascript
// In draft room component
useEffect(() => {
  const channel = supabase
    .channel(`trades:${league_id}`)
    .on(
      'broadcast',
      { event: 'trade_completed' },
      (payload) => {
        // Show popup notification to user (draft is already paused on server)
        setTradeInProgress(true);
        setTradeData(payload.payload);
        setShowTradeDetails(false); // Phase 1: just the announcement
        
        // PHASE 1: Add initial notification to activity feed
        addActivityFeedEntry({
          type: 'trade_announcement',
          message: 'A trade has been made',
          timestamp: payload.payload.timestamp,
          details: payload.payload,
          phase: 1
        });
        
        // After 1.5 seconds, show full trade details
        setTimeout(() => {
          setShowTradeDetails(true); // Phase 2: show trade cards
          
          // PHASE 2: Add detailed notification to activity feed
          addActivityFeedEntry({
            type: 'trade_details',
            message: `${payload.payload.proposing_team_name} traded with ${payload.payload.receiving_team_name}`,
            timestamp: payload.payload.timestamp,
            details: payload.payload,
            phase: 2
          });
        }, 1500);
      }
    )
    .on(
      'broadcast',
      { event: 'trade_animation_complete' },
      (payload) => {
        // Close popup after animation completes
        setTradeInProgress(false);
      }
    )
    .subscribe();
  
  return () => channel.unsubscribe();
}, [league_id]);
```

#### Trade Announcement Popup

The popup displays trade announcements in two phases with a two-card layout showing what each team receives. See [COMPONENTS.md — Trade Announcement Popup](COMPONENTS.md#trade-announcement-popup) for component code, styling, and animation details.

---

### Reject / Withdraw Trade

**Recipient Rejects**:

```
Team B clicks "Reject"
    ↓
UPDATE trade_offers SET status = 'rejected', rejected_at = now()
    ↓
No roster changes
    ↓
Team A receives notification: "Trade rejected"
```

**Proposer Withdraws**:

```
Team A opens Trade and clicks "Withdraw"
    ↓
UPDATE trade_offers SET status = 'withdrawn', withdrawn_at = now()
    ↓
No roster changes
```

### Counter-Offers (Future)

```
Team B clicks "Make Counter Offer"
    ↓
Adjust Team A's giving items
Adjust Team A's receiving items
    ↓
CREATE new trade_offer with:
  - proposing_team_id = team_b_id (roles reversed)
  - receiving_team_id = team_a_id
  - status = 'counter'
  - parent_trade_id = original_trade_id
    ↓
Original trade remains 'proposed' or becomes 'countered'
```

### Race Conditions: Trade Acceptance

**Important**: When Team A proposes a trade to Team B, Team A has already implicitly accepted the trade. Only Team B needs to explicitly accept to complete it.

**Problem**: Team B receives trade proposal from Team A. Multiple clients (same user or different browser tabs) try to accept simultaneously.

```
Team B receives trade proposal from Team A
    ↓
Team B (Client 1) clicks "Accept"
    ↓
SAME TIME: Team B (Client 2, same user in another tab) clicks "Accept"
    ↓
First acceptance should succeed, second should fail gracefully
```

**Solution**: Database constraint + application logic

```sql
-- Only one acceptance per trade (idempotent)
ALTER TABLE trade_offers
ADD CONSTRAINT unique_trade_acceptance
UNIQUE (id, status)  -- Only one row with (id, 'accepted') allowed
```

**Application Logic**:

```javascript
const acceptTrade = async (trade_offer_id) => {
  try {
    const { data, error } = await supabase
      .from('trade_offers')
      .update({ status: 'accepted', accepted_at: now() })
      .eq('id', trade_offer_id)
      .eq('status', 'proposed')  // Only update if still 'proposed'
      .select();
    
    if (error) throw error;
    
    if (!data || data.length === 0) {
      // Trade already accepted or expired
      throw new Error('Trade already accepted or expired');
    }
    
    // Execute roster update
    await executeTradeRosterUpdate(trade_offer_id);
    
  } catch (err) {
    console.error('Trade acceptance failed:', err);
    throw err;
  }
};
```

### Undo Trade (Commissioner Only)

Commissioner can undo a completed trade to revert roster states.

```
Commissioner opens Trade History
    ↓
Finds completed trade
    ↓
Clicks "Undo Trade"
    ↓
Confirmation: "This will revert both rosters. Continue?"
    ↓
Commissioner confirms
    ↓
UPDATE trade_offers SET status = 'undone', undone_at = now()
    ↓
Reverse roster changes:
  DELETE players from Team A that were received
  INSERT players back to Team A that were given
  ... (vice versa for Team B)
    ↓
UPDATE rosters table
    ↓
Realtime event: trade_undone
    ↓
Both teams notified
```

### Trade Limits & Cooldown (TBD)

Consider implementing:
- Max trades per team per week?
- Cooldown between trades?
- Commissioner approval required?
- Trade deadline (no trades after pick X)?

Current plan: No restrictions (commissioner can monitor).

---

---

## See Also

- [SECURITY.md](SECURITY.md) — Why `trade_offers` / `trade_offer_items` are the only client-written draft-path tables
- [DRAFT_ENGINE.md](DRAFT_ENGINE.md) — Draft mechanics trades operate within
- [NOTIFICATIONS.md](NOTIFICATIONS.md) — Preference checks before trade popups
- [COMPONENTS.md](COMPONENTS.md) — `TradePopup` implementation
- [COMMISSIONER.md](COMMISSIONER.md) — Commissioner trade undo
- [DATABASE.md](DATABASE.md) — `trade_offers` and `trade_offer_items` schema
- [AGENTS.md](../AGENTS.md) — Project overview
