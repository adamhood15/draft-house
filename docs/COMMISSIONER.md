# Commissioner Controls

Split out of [DRAFT_ENGINE.md](DRAFT_ENGINE.md) — the commissioner-only draft administration actions.

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

