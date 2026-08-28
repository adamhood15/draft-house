# Draft Timer

Split out of [DRAFT_ENGINE.md](DRAFT_ENGINE.md) — the server-authoritative pick clock, commissioner timer controls, expiration, the jump-ahead mechanic, and expired-pick management.

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

