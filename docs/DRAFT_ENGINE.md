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
## Draft Order

The commissioner picks the order in draft settings; it is stored on
`leagues.draft_format`. `src/lib/draft/order.ts` is the implementation and the
registry of available orders — adding one there adds it to the settings select.

### Snake

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

### Linear

Every round runs in the same direction, so a team keeps its seat in the
sequence for the whole draft.

**Example (12-team league)**:

```
Round 1: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12
Round 2: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12
...
```

### Implementation

The pseudocode below describes the snake specifically. `src/lib/draft/order.ts`
generalizes it: each order type supplies the one mapping between a round
sequence position and the seat that owns it, and everything else — round,
label, board generation, the inverse lookup — is shared.

Note that `position_in_round` and the team seat are different numbers. The seat
(`teams.draft_position`) is fixed for the whole draft; `position_in_round` is
where that seat falls in the round sequence, which mirrors on even rounds in a
snake and never moves in a linear draft.

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

---

## See Also

- [TIMER.md](TIMER.md) — Pick clock and commissioner timer controls
- [AUTO_DRAFT.md](AUTO_DRAFT.md) — Auto-draft algorithm and ranking sources
- [COMMISSIONER.md](COMMISSIONER.md) — Commissioner draft administration
- [TRADES.md](TRADES.md) — Trade offers, validation, and lifecycle
- [NOTIFICATIONS.md](NOTIFICATIONS.md) — Pick announcements and preferences
- [DATABASE.md](DATABASE.md) — Schema for picks and draft_state
- [SLEEPER.md](SLEEPER.md) — Player data and rankings
- [REALTIME.md](REALTIME.md) — Real-time updates to draft state
- [AGENTS.md](../AGENTS.md) — Project overview
