# Draft Engine

This document describes the core draft logic, pick validation, timer management, and commissioner controls.

## Overview

The Draft Engine manages the live draft for a league. It handles:
- Pick order and round progression
- Timer management (server-authoritative)
- Player selection validation
- Roster validation
- Commissioner controls (pause, undo, manual picks, etc.)
- Empty team management (auto-draft vs. manual)
- Trade offers and validation

---

## Draft Format: Snake Draft

### How Snake Draft Works

**Pick Order**:
- Round 1: Teams pick 1→12 (1.01, 1.02, ..., 1.12)
- Round 2: Teams pick 12→1 (2.12, 2.11, ..., 2.01)
- Round 3: Teams pick 1→12 (3.01, 3.02, ..., 3.12)
- Pattern repeats (alternates each round)

**Example (12-team league)**:

```
Round 1: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12
Round 2: 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1
Round 3: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12
Round 4: 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1
...
```

### Implementation

**Calculating Next Pick**:

```
current_pick_number = X  (1-indexed)
league_size = 12
total_rounds = 16

// Determine current round
current_round = ceil(X / league_size)

// Determine pick position within round
position_in_round = ((X - 1) % league_size) + 1

// Determine if odd or even round (determines direction)
if (current_round % 2 == 1):
    // Odd round: ascending (1 → 12)
    team_in_round = position_in_round
else:
    // Even round: descending (12 → 1)
    team_in_round = league_size - position_in_round + 1

// Get draft_position for this team
current_team_id = teams[team_in_round].id
```

---

## Timer Management

### Server-Authoritative Timer

The timer is **not** calculated by each client. Instead:

1. Server stores `draft_state.timer_seconds` (countdown)
2. Server stores `draft_state.timer_started_at` (when timer began)
3. Server periodically decrements or recalculates
4. Clients subscribe to real-time updates
5. Clients calculate local UI time based on server value

**Why**:
- Prevents clients from manipulating the timer
- Keeps all clients in sync
- Commissioner controls affect all clients immediately

### Timer Lifecycle

```
Timer Active (counting down)
    └── commissioner calls pause()
            └── timer_paused = true
                └── timer stops decrementing
                    └── commissioner calls play()
                        └── timer_paused = false
                            └── timer resumes
```

### Commissioner Timer Controls

#### 1. Pause / Resume

```
CURRENT STATE: timer_seconds = 35

commissioner.pauseDraft()
    ↓
UPDATE draft_state SET timer_paused = true
    ↓
Realtime event → All clients freeze timer at 35

commissioner.resumeDraft()
    ↓
UPDATE draft_state SET timer_paused = false
    ↓
Realtime event → All clients resume countdown
```

#### 2. Edit Timer

```
Commissioner wants to change time to 45 seconds

commissioner.editTimer(45)
    ↓
UPDATE draft_state SET timer_seconds = 45, timer_restarted_at = now()
    ↓
Realtime event → All clients update to 45 seconds

Timer continues counting down from 45
```

#### 3. Reset Timer

```
Commissioner wants to reset to default (60 seconds)

commissioner.resetTimer()
    ↓
UPDATE draft_state SET timer_seconds = 60, timer_restarted_at = now()
    ↓
Realtime event → All clients see 60 seconds

Timer counts down from 60
```

#### 4. Deactivate Timer

Commissioner can completely disable the timer, giving the current team unlimited time.

A draft can also *start* this way: `draft_settings.timer_enabled` is a pre-draft default the commissioner sets on the league setup page (see [DATABASE.md](DATABASE.md#3-draft_settings)), and seeds `draft_state.timer_active` when the draft is initialized. From that point on, the live toggle below is what actually governs the countdown — setting the initial value doesn't limit the commissioner from flipping it mid-draft either way.

```
Commissioner clicks "Deactivate Timer"
    ↓
UPDATE draft_state SET timer_active = false
    ↓
Realtime event → All clients hide/disable timer display
    ↓
Current team has unlimited time (no countdown)
    ↓
Current team can make pick whenever ready
    ↓
No auto-pick or timeout occurs
    ↓
When current team makes pick:
    Commissioner can reactivate timer for next pick
    OR keep timer deactivated for all remaining picks
```

**Reactivate Timer**:

```
Commissioner clicks "Reactivate Timer"
    ↓
UPDATE draft_state SET timer_active = true, timer_seconds = 60
    ↓
Realtime event → Timer resumes for next pick
    ↓
Normal countdown behavior resumes
```

### Timer Expiration

When `timer_seconds` reaches 0:

```
Is timer active (timer_active = true)?
    ├─ NO: Timer is deactivated
    │   └── No expiration occurs
    │   └── Team has unlimited time
    │   └── Commissioner can reactivate anytime
    │
    └─ YES: Timer expired for current team (Pick #N)
        ↓
        UPDATE draft_state SET 
          timer_expired = true,
          timer_expired_at = now(),
          expired_team_id = team_id
        ↓
        UPDATE draft_board SET status = 'expired', expired_at = now()
          WHERE pick_number = current_pick_number
        ↓
        AUTOMATICALLY ADVANCE to next player's timer:
        UPDATE draft_state SET
          next_pick_team_id = calculate_next_team(current_pick_number + 1),
          timer_seconds = 60,
          timer_started_at = now()
        ↓
        Realtime event: "timer_expired"
        ↓
        All clients see:
            ├─ Draft board picks #N now shows status = 'expired'
            ├─ Expired player's status: "⏱️ TIME EXPIRED"
            │   └─ Can still pick at any time
            ├─ Next player's status: "🟢 YOUR TURN / YOU CAN PICK NOW"
            │   └─ Timer starts counting down for them
            │   └─ Can pick or wait for expired player
            └─ Display automatically switches focus to next player's clock
```

### Jump Ahead Mechanic (Soft Timeout)

When a player's time expires, they don't lose their turn or get auto-picked. Instead:

1. **Expired player can still pick** (but timer is expired)
2. **Next player can jump ahead** (make their pick before the expired player)
3. **Both picks are valid** (no penalty for either player)

**Flow**:

```
Player A on clock (Pick #1)
Timer starts (60 seconds)
    ↓
...40 seconds later...
    ↓
Player A still deciding
    ↓
Timer expires (timer_seconds = 0)
    ↓
UPDATE draft_state SET timer_expired = true, expired_team_id = team_a
    ↓
AUTOMATICALLY SWITCH to Player B's timer:
    ↓
UPDATE draft_state SET next_pick_team_id = team_b, timer_seconds = 60
    ↓
All clients see:
    ├─ Player A: "⏱️ TIME EXPIRED" (can still pick anytime)
    └─ Player B: "🟢 YOUR TURN" + timer starts countdown from 60
    ↓
Scenario 1: Player A picks first (before Player B's timer expires)
  └── Player A's pick is recorded
      └── Timer resets
      └── Advance to Player B (on clock normally)
      └── Player B's fresh 60-second timer starts
      
Scenario 2: Player B picks first (jumps ahead)
  └── Player B's pick is recorded
      └── Timer resets
      └── Advance to Player C (on clock)
      └── Player C's timer starts
      └── Player A must still make their pick (can pick whenever ready)
      
Scenario 3: Both click pick simultaneously (same player)
  ├── Player A (expired): Tries to pick Player X
  ├── Player B (on clock): Tries to pick Player X at same time
  ├── First INSERT wins (database constraint)
  ├── Player A gets Player X (first insert succeeds)
  └── Player B gets error: "Player X already drafted"
      └── Player B can IMMEDIATELY select a different player
      └── No need to wait for their next turn
      └── They are still on the clock
```

**UI Behavior When Expired**:

```
Player A's Clock (Expired):
┌─────────────────────┐
│ ⏱️  TIME EXPIRED    │
│                     │
│ [Still can pick]    │
│ (search & select)   │
└─────────────────────┘

Player B's Clock (Available to Jump):
┌─────────────────────┐
│ 🟢 YOU CAN PICK NOW │
│ Player A expired    │
│ [Make your pick]    │
│ [Or wait]           │
└─────────────────────┘
```

**Important**: Getting jumped does NOT prevent Player A from picking later. Player A retains full picking ability at any time, even after being jumped.

```
Timeline:
  Pick #1 (Player A) timer expires
      ↓
  Player B can now pick (jump option available)
      ↓
  Scenario A: Player B picks → Advances to Pick #3
              Player A can STILL pick Pick #1 whenever ready
      
  Scenario B: Player B doesn't pick yet
              Player A picks → Advances to Pick #2
              Player B then picks Pick #3 normally
```

### Expired Picks Management

**Tracking Expired Picks**:

`draft_state.timer_expired`, `timer_expired_at`, and `expired_team_id` track this — see [DATABASE.md](DATABASE.md#5-draft_state) for the full column list.

**When expired team finally picks**:

```
Scenario: Player A (expired Pick #1) picks after being jumped by Player B (Pick #2)
          Player C is now on clock (Pick #3)
    ↓
Player A finally selects their player
    ↓
INSERT INTO picks (league_id, team_id, player_id, pick_number = 1, ...)
    ↓
UPDATE draft_state SET
  timer_expired = false,
  expired_team_id = null
    ↓
DO NOT increment current_pick_number
    (Player C is still on clock at Pick #3)
    ↓
Realtime event: pick_made
    ↓
All clients see:
  ├─ Pick #1 (Player A) is now recorded
  ├─ Pick #2 (Player B) already recorded
  └─ Pick #3 (Player C) still on clock with their timer
```

**Track Each Team's Assigned Picks**:

To handle out-of-order picks automatically and prepare for draft pick trades, maintain a list of each team's assigned pick numbers. Schema lives in [DATABASE.md](DATABASE.md#15-team_pick_assignments) — this section just illustrates how it's queried.

```sql
-- Example: 10-team snake draft
-- Team at draft position #10 currently owns:
SELECT pick_number FROM team_pick_assignments
WHERE league_id = 'league_123' AND current_owner_team_id = 'team_10'
ORDER BY pick_number;

Results:
10, 11, 30, 31, 50, 51, 70, 71, 90, 91, ... (etc for all rounds)

-- Team at draft position #1 currently owns:
1, 20, 21, 40, 41, 60, 61, 80, 81, 100, ... (etc)
```

**Automatic Out-of-Order Pick Slotting**:

When an expired player finally picks, the system:

```javascript
const playerFinallyPicks = async (team_id, player_id) => {
  // Query draft_board: find team's next pending/expired pick slot
  const nextPickSlot = await supabase
    .from('draft_board')
    .select('id, pick_number')
    .eq('league_id', league_id)
    .eq('assigned_team_id', team_id)
    .in('status', ['pending', 'expired'])
    .order('pick_number', { ascending: true })
    .limit(1)
    .single();
  
  // nextPickSlot.pick_number = 1 (Team A's first unpicked slot)
  
  // Begin transaction
  // 1. Insert pick record
  const { data: pick } = await supabase
    .from('picks')
    .insert({
      league_id,
      team_id,
      sleeper_player_id: player_id,
      pick_number: nextPickSlot.pick_number
    });
  
  // 2. Update draft_board to mark as completed
  await supabase
    .from('draft_board')
    .update({ 
      status: 'completed',
      pick_id: pick.id,
      updated_at: now()
    })
    .eq('id', nextPickSlot.id);
  
  // 3. Update rosters denormalized table
  await updateRostersTable(team_id, player_id);
  
  return pick;
};
```

**Why This Approach**:
- `draft_board` is single source of truth for pick slot state (pending/expired/completed)
- No manual "which pick should this be?" calculation needed
- Picks automatically slot into correct sequential position
- Real-time subscription to `draft_board` shows all clients current draft state
- Linking `pick_id` on draft_board allows querying "who picked at slot #5?"

**Benefits**:
- Out-of-order picks automatically slot into correct position
- No manual assignment or "pick_number_submitted_as" tracking needed
- Draft board always shows correct order
- **Required for draft pick trades** (when Team A trades "Pick #20" to Team B, mark it as traded_to_team_id)

---

## Pick Selection & Validation

### Draft Load Validation

**One-time validation when draft starts** (before any picks are made):

```
Draft is about to begin
    ↓
Server fetches all players from Sleeper league
    ↓
Validates all players still exist in Sleeper API
    ↓
Caches player data locally (sleeper_player_id, name, position, bye, etc.)
    ↓
If any players no longer exist in Sleeper:
    ├─ Log warning or error
    └─ May notify commissioner
    ↓
Draft can now proceed
    ├─ All available players cached and valid
    └─ Pick submission only needs runtime checks (not availability checks)
```

**Benefit**: Player existence is validated once at draft start, not on every pick submission. Faster pick processing during active draft.

### Valid Pick

A pick is valid if (at submission time):
1. ~~Player exists in Sleeper~~ (already validated at draft load)
2. Player is not already drafted
3. Player does not violate position eligibility (if enforced)
4. Current team has available roster spot
5. Pick is submitted by current team's owner OR commissioner

### Invalid Pick Responses

```
// Player already drafted
{
  "error": "This player has already been drafted.",
  "player_id": "2222"
}

// Roster full
{
  "error": "Your roster is full. You cannot draft more players.",
  "available_spots": 0
}

// Position eligibility violation (if enforced)
{
  "error": "You have reached the maximum at this position.",
  "position": "RB",
  "max": 2,
  "current": 2
}
```

### Making a Pick

```
PlayerA (team 1) selects Bijan Robinson
    ↓
client.submitPick({
  league_id: "league_123",
  team_id: "team_1",
  sleeper_player_id: "2222",
  ...
})
    ↓
Server validates (fast checks only):
  ✓ Player not already drafted (check picks table)
  ✓ Roster spot available (check rosters table)
  ✓ It's this team's turn OR commissioner is forcing
    ↓
    (Player existence already validated at draft load)
    ↓
INSERT INTO picks (league_id, team_id, player_id, ...)
    ↓
UPDATE rosters SET players = array_append(players, {
  player_id: "2222",
  name: "Bijan Robinson",
  position: "RB",
  ...
})
  WHERE team_id = team_1 AND league_id = league_123
    ↓
UPDATE draft_state SET current_pick_number = current_pick_number + 1
    ↓
UPDATE draft_board SET status = 'completed', pick_id = ? 
  WHERE pick_number = current_pick_number - 1
    ↓
Realtime event: pick_made
    ↓
All clients receive: "Bijan Robinson drafted by The Hoodlums"
    ↓
All clients update team roster displays (via rosters realtime subscription)
    ↓
Timer resets to default
```

### Drafted Player Tracking & Display

**Problem**: Users need to know which players have already been drafted so they don't waste time searching for unavailable players.

**Solution**: Track drafted players in real-time and display a "drafted" label in player search results.

#### Checking if Player is Drafted

```sql
-- Query to check if a player is already drafted in this league
SELECT EXISTS(
  SELECT 1 FROM picks
  WHERE league_id = ? 
  AND sleeper_player_id = ?
  AND deleted_at IS NULL  -- Ignore undone picks
) as is_drafted;
```

#### Display Drafted Status

When users search for or browse players:

1. **Available Player**:
   ```
   Bijan Robinson (RB, ATL)  |  ADP: 1.02
   [ DRAFT ]
   ```

2. **Drafted Player**:
   ```
   Bijan Robinson (RB, ATL)  |  ADP: 1.02
   [DRAFTED by The Hoodlums]  ← Cannot click/select
   ```

#### Real-Time Updates

When a pick is made:

```
pick_made realtime event includes:
├── sleeper_player_id: "2222"
├── player_name: "Bijan Robinson"
├── drafted_by_team: "The Hoodlums"
└── timestamp: "2025-09-04T14:32:15Z"

All clients subscribe to picks table changes:
    ↓
Immediately update UI to show player as drafted
    ↓
Disable draft button for that player
    ↓
Show drafted label with team name
```

#### Implementation in Pick Validation

```javascript
// Before allowing a pick to be submitted
const validatePickAvailability = async (league_id, sleeper_player_id) => {
  // Check if player is already drafted
  const existingPick = await supabase
    .from('picks')
    .select('id, team_id, teams(draft_house_team_name)')
    .eq('league_id', league_id)
    .eq('sleeper_player_id', sleeper_player_id)
    .is('deleted_at', null)
    .single();
  
  if (existingPick) {
    return {
      available: false,
      drafted_by: existingPick.teams.draft_house_team_name,
      error: `This player has already been drafted by ${existingPick.teams.draft_house_team_name}`
    };
  }
  
  return { available: true };
};
```

#### Frontend: Player Search Display

```javascript
// When displaying players in search/browse interface
const PlayerCard = ({ player, league_id }) => {
  const [draftStatus, setDraftStatus] = useState(null);
  
  useEffect(() => {
    // Subscribe to this player's draft status
    const subscription = supabase
      .from('picks')
      .on('*', payload => {
        if (payload.new.sleeper_player_id === player.sleeper_player_id) {
          setDraftStatus({
            drafted: true,
            drafted_by: payload.new.drafted_by_team_name
          });
        }
      })
      .subscribe();
    
    return () => subscription.unsubscribe();
  }, [player.sleeper_player_id]);
  
  return (
    <div className="player-card">
      <h3>{player.name}</h3>
      <p>{player.position} - {player.nfl_team}</p>
      {draftStatus?.drafted ? (
        <button disabled className="btn-drafted">
          DRAFTED by {draftStatus.drafted_by}
        </button>
      ) : (
        <button className="btn-draft" onClick={() => draftPlayer(player)}>
          DRAFT
        </button>
      )}
    </div>
  );
};
```

---

## Pick Announcement & Animation Sequence

When a player is selected, a coordinated sequence of events occurs across all clients: draft pause, notification, animation, and then draft resume. This creates an engaging experience and gives all players time to react.

### Sequence Overview

```
1. Pick submitted by Team A
    ↓
2. Server pauses draft timer immediately
    ↓
3. Broadcast pick_in_progress event to all clients
    ↓
4. All clients show "The pick is in" popup + activity feed notification
    ↓
5. Play draft chime sound
    ↓
6. After 1.5 seconds, update popup message:
   "With the X pick of the 2026 [League Name] draft, [Team] selects..."
    ↓
7. Display animated player card in popup with:
   - Player image (scales in with fade)
   - Player name (slides in from bottom)
   - Player position (fades in)
    ↓
8. Update activity feed with full pick details
    ↓
9. Allow players to react to activity feed entry
    ↓
10. After animation completes (3-4 seconds total):
    Close popup
    ↓
11. Update draft_state: increment pick number
    ↓
12. Resume timer for next team
```

### Server-Side: Draft Pause & Broadcast

```javascript
const submitPickWithAnimation = async (league_id, team_id, player_id) => {
  // Validate pick
  const validation = await validatePick(league_id, team_id, player_id);
  if (!validation.valid) throw new Error(validation.error);
  
  // STEP 1: Pause draft immediately
  await supabase
    .from('draft_state')
    .update({ timer_paused: true, pause_reason: 'pick_in_progress' })
    .eq('league_id', league_id);
  
  // Insert the pick
  const pick = await supabase
    .from('picks')
    .insert({
      league_id,
      team_id,
      sleeper_player_id: player_id,
      pick_number: current_pick_number,
      created_at: now()
    })
    .select();
  
  // Update rosters
  await updateTeamRoster(team_id, player_id);
  
  // Fetch player details for display
  const playerData = await getPlayerData(player_id);
  
  // STEP 2: Broadcast pick_in_progress event
  supabase.channel(`draft:${league_id}`).send({
    type: 'broadcast',
    event: 'pick_in_progress',
    payload: {
      pick_number: current_pick_number,
      team_id: team_id,
      team_name: team_name,
      league_name: league_name,
      league_season: league_season,
      player_id: player_id,
      player_name: playerData.name,
      player_position: playerData.position,
      // Built from a template, not fetched or stored — see SLEEPER.md#player-photos
      player_image_url: getPlayerImageUrl(player_id, playerData.position),
      player_nfl_team: playerData.nfl_team
    }
  });
  
  // Timer for animation sequence (3-4 seconds)
  setTimeout(async () => {
    // STEP 11: Increment pick number
    await supabase
      .from('draft_state')
      .update({
        current_pick_number: current_pick_number + 1,
        timer_paused: false  // Resume timer
      })
      .eq('league_id', league_id);
    
    // Broadcast animation complete
    supabase.channel(`draft:${league_id}`).send({
      type: 'broadcast',
      event: 'pick_animation_complete',
      payload: { next_team_id: next_team_id }
    });
  }, 3500); // 3.5 second animation sequence
};
```

### Client-Side: Notification Popup

All clients subscribe to pick events:

```javascript
useEffect(() => {
  const channel = supabase
    .channel(`draft:${league_id}`)
    .on('broadcast', { event: 'pick_in_progress' }, (payload) => {
      // Show "The pick is in" popup
      setPickInProgress(true);
      setPickData(payload.payload);
      
      // Play draft chime immediately
      playDraftChime();
      
      // After 1.5 seconds, show full pick announcement
      setTimeout(() => {
        setShowPickAnnouncement(true);
      }, 1500);
    })
    .on('broadcast', { event: 'pick_animation_complete' }, (payload) => {
      // Close popup
      setPickInProgress(false);
      setShowPickAnnouncement(false);
    })
    .subscribe();
  
  return () => channel.unsubscribe();
}, [league_id]);
```

### Pick Announcement Popup

The popup displays pick announcements in two phases with animations. See [COMPONENTS.md — Pick Announcement Popup](COMPONENTS.md#pick-announcement-popup) for component code, styling, and animation details.

### Activity Feed Integration

When the pick announcement popup is showing, the activity feed is also updated:

```javascript
// After pickup is confirmed
const addPickToActivityFeed = async (league_id, pick_data) => {
  await supabase
    .from('chat_messages')
    .insert({
      league_id,
      message_type: 'pick',
      content: `${pick_data.team_name} selected ${pick_data.player_name}`,
      pick_id: pick_data.pick_id,
      sender_id: pick_data.team_owner_id,
      created_at: now()
    });
};
```

Players can immediately react to the pick in the activity feed with emoji reactions while the animation is still playing.

---

## Roster Validation

### Roster Construction

Each league has a roster configuration (from Sleeper):

```
QB:   1
RB:   2
WR:   2
TE:   1
FLEX: 1
DEF:  1
BN:   6
---
TOTAL: 14 players
```

### Position Eligibility

**Current Plan**: Do NOT enforce position eligibility

**Rationale**:
- Adds complexity to auto-draft logic
- Commissioner can manually enforce if needed
- Sleeper already validated this; no need to re-validate

**If we add enforcement later**:
- Store position eligibility on player record
- Check before accepting pick
- Deny pick if roster position filled

### Roster Completion Check

```
Team has 14 roster spots
Team has drafted 14 players
    ↓
Roster is complete

When team is on clock:
    └── Skip to next team
        └── Don't require pick from completed roster
```

---

## Auto-Draft Logic

When a team is set to `is_auto_draft = true`, the system automatically selects players.

### Algorithm

```
Team X is on the clock
    ↓
Team X is auto_draft enabled?
    ├─ NO:
    │   └── Wait for human selection
    │       └── Timer counts down
    │       └── On expiration: jump-ahead applies (see Timer Expiration above) — no commissioner action required
    │
    └─ YES:
        ↓
        No timer countdown starts — auto-draft teams pick immediately when they're on the clock
        (jump-ahead never applies to an auto-draft team; it's never left "expired")
        ↓
        Calculate picks remaining for this team until end of draft
        Calculate roster positions still needed (QB, RB, WR, TE, DEF, etc.)
        ↓
        Are picks_remaining <= positions_needed?
        ├─ YES: Must fill positions (constrained mode)
        │   └── Get list of needed positions
        │   └── For each needed position, find highest-ranked available player
        │   └── Select the highest-ranked player at a needed position
        │
        └─ NO: Can prioritize by ranking (unconstrained mode)
            └── Query rankings (Sleeper → External API → Fallback)
            └── Select highest-ranked available player (any position)
                ↓
                Record pick
                ↓
                Advance to next team
```

### Ranking Source Priority

Use rankings in this order:

```
1. Fantasy Football Calculator ADP (default — free, no API key, fetched once at draft load)
2. FantasyPros Premium consensus rankings (optional — only if commissioner has supplied an API key)
3. Simple heuristic fallback (if both sources are unreachable at draft-load time)
   └── Combination of player value, position scarcity, bye weeks
```

See [SLEEPER.md](SLEEPER.md#player-rankings-for-auto-draft) for the FFC/FantasyPros integration details, including how FFC's ranking data is matched to `sleeper_player_id` at draft load.

### Position-Aware Auto-Draft (Constrained Mode)

When picks remaining <= positions needed:

```
Team A's current roster:
  QB: 1/1 ✓ (complete)
  RB: 1/2 (need 1 more)
  WR: 2/2 ✓ (complete)
  TE: 0/1 (need 1 more)
  DEF: 0/1 (need 1 more)
  BN: 4/6 (need 2 more bench)

Picks remaining: 2
Positions still needed: 3 (RB, TE, DEF)
    ↓
Since picks_remaining (2) < positions_needed (3):
    ↓
    Must pick from: [RB, TE, DEF]
    ↓
    Get highest-ranked available at each position:
    - RB: Player A (rank 5)
    - TE: Player B (rank 8)
    - DEF: Player C (rank 22)
    ↓
    Select Player A (highest ranked at a needed position)
    ↓
    Next pick: 1 pick remaining, 2 positions needed
    Must pick from remaining needed positions
    ↓
    Options: [TE, DEF]
    ↓
    Select highest-ranked: TE Player B
    ↓
    Roster now complete
```

### Unconstrained Auto-Draft (Ranking-Based)

When picks remaining > positions needed:

```
Team B has 3 picks left, only 1 position needed (DEF)
    ↓
Can pick by pure ranking (not forced to fill position)
    ↓
Simply select: highest-ranked available player (any position)
    ↓
Prioritizes overall talent over roster completion
```

---

## Commissioner Controls

### 1. Pause / Resume / Deactivate Timer

**Pause/Resume**: Freeze the countdown, then resume from where it was paused (already covered above)

**Deactivate Timer**: Completely disable the timer, giving current team unlimited time with no countdown

See Timer Management section above for detailed behavior.

### 2. Manually Assign a Player

Commissioner can force-pick a player for any team (useful for:
- Owner not available
- Empty team (unowned in Sleeper)
- Fixing accidental pick)

```
commissioner.makePickFor({
  league_id: "league_123",
  team_id: "team_8",  // empty team
  sleeper_player_id: "2222"
})
    ↓
Server validates:
  ✓ Commissioner verified
  ✓ Player not drafted
  ✓ Roster spot available
    ↓
INSERT INTO picks (...)
    ↓
Draft advances (same as normal pick)
```

### 3. Undo a Pick

Commissioner can undo picks one at a time, starting with the most recent pick. They can continue undoing sequentially back to the beginning of the draft.

**Single Undo (Most Recent Pick Only)**:

```
Current state: Pick #47 completed, current_pick_number = 48
Commissioner clicks "Undo Pick"
    ↓
DELETE FROM picks WHERE id = pick_47_id
    ↓
UPDATE rosters SET players = array_remove(players, player_id_of_pick_47)
  WHERE team_id = team_from_pick_47
    ↓
UPDATE draft_state SET current_pick_number = 47
    ↓
UPDATE draft_board SET status = 'pending'
  WHERE pick_number = 47
    ↓
Timer resets to default
    ↓
Realtime event: "Pick undone"
    ↓
All clients see: 
    ├─ Pick #47 undone
    ├─ Player removed from team roster
    ├─ Draft board pick #47 back to pending
    └─ Pick #47 back on the clock
```

**Sequential Undo (Building Back)**:

```
After first undo: current_pick_number = 47
Pick #46 completed by Team B (drafted Player Y)
Commissioner sees "Undo" button again (only for most recent)
    ↓
Clicks "Undo Pick"
    ↓
DELETE FROM picks WHERE id = pick_46_id
    ↓
UPDATE draft_state SET current_pick_number = 46
    ↓
Revert to Team from Pick #46 (back on clock)
    ↓
Can continue undoing one pick at a time
    ↓
All the way back to first pick (Pick #1) if needed
```

**Important Behavior**:
- Only the most recent (last) pick can be undone
- Once undone, the previous pick becomes the "last" and can then be undone
- No batch undo or jump back to specific pick
- Commissioner must undo each pick individually
- Each undo resets the timer to default duration
- Pick order recalculates after each undo

### 4. Reset Draft Clock

Already covered above (reset to default duration).

### 5. Reset Entire Draft

If something has gone seriously wrong (database corruption, incorrect state, major logic error), commissioner can reset the entire draft to start over.

**Reset Draft (Nuclear Option)**:

```
Commissioner opens advanced settings
    ↓
Clicks "Reset Draft" (with warning modal)
    ↓
Confirmation dialog:
  ⚠️  WARNING: This will delete ALL picks and reset the draft to pick #1.
      All teams will lose their drafted players.
      The activity feed will be cleared.
      All data will be archived for reference.
      This action CANNOT be undone.
  ❌  NO / ✅  YES, RESET
    ↓
Commissioner confirms
    ↓
ARCHIVE PHASE (backup before deletion):
    ↓
    INSERT INTO draft_reset_archive (league_id, archived_picks, archived_messages, archived_reactions, archived_at)
      SELECT league_id, 
             array_agg(picks.*), 
             array_agg(chat_messages.*),
             array_agg(reactions.*)
      WHERE league_id = ?
    ↓
    (Old picks, messages, reactions now safely archived)
    ↓
RESET PHASE (clean deletion):
    ↓
    DELETE FROM picks WHERE league_id = ?
    ↓
    DELETE FROM chat_messages WHERE league_id = ? AND message_type IN ('pick', 'trade', 'system')
    ↓
    DELETE FROM reactions WHERE league_id = ?
    ↓
    UPDATE draft_state SET 
      current_pick_number = 1,
      timer_seconds = 60,
      timer_paused = false,
      draft_reset_at = now()
    ↓
    UPDATE leagues SET draft_status = 'drafting' WHERE id = league_id
    ↓
    UPDATE rosters SET players = '[]' WHERE league_id = ?
    ↓
    UPDATE draft_board SET status = 'pending' WHERE league_id = ?
    ↓
    INSERT INTO chat_messages:
      message_type: 'system'
      content: '{Commissioner name} reset the draft. Starting over at Pick #1.'
    ↓
Realtime event: "draft_reset"
    ↓
All clients see:
  ├─ Activity feed completely cleared
  ├─ Permanent system message: "{Commissioner} reset the draft. Starting over at Pick #1."
  └─ Message CANNOT be deleted (permanent record)
    ↓
Draft restarts from the beginning with fresh activity feed
```

**Validation**:
- Only commissioner can reset
- Confirmation required (2-click activation)
- Logged for audit trail
- All teams notified immediately
- Cannot reset if draft is already completed

**Implementation Details**:
- Reset ALWAYS shows permanently in activity feed (cannot be deleted)
- Commissioner CANNOT specify pick number to reset to (always resets to #1)
- Archive mode: All picks, chat messages, and reactions are ALWAYS archived before reset

### 6. Control Empty Teams

Commissioner chooses:
- **Manual**: Make picks manually when it's their turn
- **Auto-Draft**: System auto-picks

```
commissioner.setTeamMode({
  team_id: "team_8",
  mode: "auto_draft"  // or "manual"
})
    ↓
UPDATE teams SET is_auto_draft = true WHERE id = "team_8"
    ↓
When team 8's turn arrives:
  └── System auto-picks (already described above)
```

---

## Race Conditions & Concurrency

### Problem: Simultaneous Picks

```
Team A picks Player X (same time)
Team B picks Player X (same time)
    ↓
Who gets Player X?
```

**Solution**: Database constraint

```sql
UNIQUE(pick.league_id, pick.sleeper_player_id)
```

First insert succeeds, second insert fails:

```
Team A: INSERT → Success
Team B: INSERT → UNIQUE constraint violation → Error

Team B receives:
{
  "error": "Player already drafted",
  "player_id": "2222"
}
```

### Problem: Timer Expiration & Manual Pick (Simultaneous)

```
Timer reaches 0
    ↓
auto-pick triggered
    ↓
SAME TIME: Commissioner makes manual pick
    ↓
Two picks inserted?
```

**Solution**: Check if team already has pick for this round

```sql
INSERT INTO picks (...)
  WHERE NOT EXISTS (
    SELECT 1 FROM picks p2
    WHERE p2.team_id = ? AND p2.round = ?
  )
```

---

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
   FROM picks
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
    .from('draft_state')
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
      .from('draft_state')
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

## Notification Preferences & Settings

Players should have full control over which announcements they see. Some players may find popups distracting, while others enjoy them. A settings area allows players to customize their announcement experience.

### User Preferences Schema

```javascript
// Each user has notification preferences stored in a user_preferences table
user_preferences
├── user_id (UUID, PK)
├── league_id (UUID, PK) -- League-specific preferences
├── show_pick_announcements (BOOLEAN) -- Show pick popup/chime
├── show_trade_announcements (BOOLEAN) -- Show trade popup
├── auto_dismiss_announcements (BOOLEAN) -- Auto-close popups after 3.5s
├── auto_dismiss_delay_ms (INTEGER) -- Customizable dismiss delay (default: 3500)
├── enable_announcement_sound (BOOLEAN) -- Play draft chime/notification sounds
├── announcement_volume (FLOAT) -- Volume level 0.0 - 1.0 (default: 0.6)
├── show_in_activity_feed (BOOLEAN) -- Show picks/trades in activity feed
├── created_at (TIMESTAMP)
└── updated_at (TIMESTAMP)
```

### Notification Preferences Settings

See [COMPONENTS.md — Notification Preferences Settings](COMPONENTS.md#notification-preferences-settings) for the complete NotificationPreferencesModal component implementation and styling.

### Checking Preferences Before Showing Popups

When a pick or trade announcement is about to be displayed, check the user's preferences:

```javascript
// When pick_in_progress event is received
const handlePickAnnouncement = async (payload, user_id, league_id) => {
  // Fetch user's preferences
  const prefs = await getUserPreferences(user_id, league_id);
  
  // Check if user wants to see pick announcements
  if (!prefs.show_pick_announcements) {
    console.log('Pick announcements disabled by user');
    return; // Don't show popup
  }
  
  // Show popup
  setPickInProgress(true);
  setPickData(payload);
  
  // Play chime only if enabled
  if (prefs.enable_announcement_sound) {
    playDraftChime(prefs.announcement_volume);
  }
  
  // Auto-dismiss if enabled
  if (prefs.auto_dismiss_announcements) {
    setTimeout(() => {
      setPickInProgress(false);
    }, prefs.auto_dismiss_delay_ms);
  }
};

// Same for trade announcements
const handleTradeAnnouncement = async (payload, user_id, league_id) => {
  const prefs = await getUserPreferences(user_id, league_id);
  
  if (!prefs.show_trade_announcements) {
    console.log('Trade announcements disabled by user');
    return; // Don't show popup
  }
  
  // Show popup, play sound, etc.
  displayTradePopup(payload, prefs);
};
```

### Settings Access

Players can access notification preferences from:

1. **Settings Icon** in the draft room header
2. **User Profile Menu** → Notification Settings
3. **During Draft** → Settings button (top-right corner)

Each league has its own preference set, so players can customize differently for different leagues.

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

## Draft Completion

### Draft Ends When

```
All teams have drafted all roster spots
    ↓
UPDATE draft_state SET draft_ended_at = now()
    ↓
UPDATE leagues SET draft_status = 'complete' WHERE id = league_id
    ↓
Realtime event: draft_complete
    ↓
Clients transition to draft results view
```

### Final State

```
SELECT t.draft_house_team_name, COUNT(p.id) as picks_made
FROM teams t
LEFT JOIN picks p ON t.id = p.team_id
WHERE t.league_id = ?
GROUP BY t.id
ORDER BY t.draft_position;
```

Result: Final roster for each team.

---

## Validation Rules

### Before Accepting a Pick

- [x] Player exists in Sleeper
- [x] Player has not been drafted
- [x] Team has roster spot available
- [x] It is this team's turn (or commissioner is forcing)
- [ ] Position eligibility (if enforced)
- [x] No duplicate picks in same transaction

### Before Starting Draft

- [x] All league settings reviewed by commissioner
- [x] All draft settings reviewed by commissioner
- [x] Commissioner has claimed a team
- [x] All invite links generated
- [x] Commissioner ready (or countdown expired)

---

## Performance Considerations

### Real-Time Updates

- Pick events trigger Supabase Realtime
- Subscribers: All clients in the league
- Debounce timer ticks (send every 1s, not every 100ms)

### Database Queries

- `picks` table indexed by `(league_id, team_id, created_at)`
- `draft_state` single row, frequently updated
- Consider materialized view for "picks per team"

### Calculations

- Pick order calculation (round, position) done in application, not SQL
- Reduces database load

---

## Testing Draft Logic

### Test Scenarios

1. **Normal snake draft**
   - 12 teams, 16 rounds
   - Verify pick order each round
   - Verify team assignment

2. **Auto-draft**
   - Empty team set to auto-draft
   - Verify correct ranking used
   - Verify no duplicate picks

3. **Commissioner undo**
   - Undo single pick
   - Verify pick deleted, team back on clock
   - Verify timer reset

4. **Timer expiration**
   - Auto-pick triggered
   - Verify correct player selected
   - Verify no commissioner action required

5. **Race conditions**
   - Simultaneous picks for same player
   - One succeeds, one fails with error

---

## See Also

- [DATABASE.md](DATABASE.md) — Schema for picks and draft_state
- [SLEEPER.md](SLEEPER.md) — Player data and rankings
- [REALTIME.md](REALTIME.md) — Real-time updates to draft state
- [AGENTS.md](../AGENTS.md) — Project overview
