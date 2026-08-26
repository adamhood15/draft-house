# Database

This document describes the Draft House database schema, relationships, and design decisions.

## Database Technology

- **System**: PostgreSQL (via Supabase)
- **Design Pattern**: Relational model with real-time subscriptions

## Core Tables

### 1. `users`

Represents Draft House user accounts (username/password authentication).

```sql
users
├── id (UUID, primary key)
├── username (VARCHAR, unique)
├── auth_email (VARCHAR, unique, internal-only)
├── display_name (VARCHAR)
├── avatar_url (TEXT, optional)
├── password_hash (handled by Supabase Auth)
├── created_at (TIMESTAMP)
└── updated_at (TIMESTAMP)
```

**Notes**:
- Username is unique across the application
- Display name is the name shown in leagues and chat
- Avatar is optional (may be used for team profile popups)
- Passwords managed entirely by Supabase Auth (never directly in application)
- **Auth strategy**: Users sign up with a username and password only — no real email address is ever collected or required. Supabase Auth requires an email identifier internally, so signup generates a synthetic one (e.g. `{username}@drafthouse.invalid`) and stores it in `auth_email`. This field is never shown to users and is not a contact address. The domain is `.invalid` specifically — RFC 2606 reserves it for exactly this purpose; the more obvious-looking `.internal` is a *different* reserved TLD (RFC 9476) that Supabase Auth's email validator actually rejects.

---

### 2. `leagues`

Represents a Draft House league (imported from Sleeper).

```sql
leagues
├── id (UUID, primary key)
├── commissioner_id (FK → users.id)
├── sleeper_league_id (VARCHAR, unique)
├── name (VARCHAR)
├── season (INTEGER)
├── league_size (INTEGER)
├── scoring_format (VARCHAR) -- e.g., "half_ppr", "ppr", "std"
├── draft_format (VARCHAR) -- e.g., "snake"
├── rosters_per_team (INTEGER)
├── positions (JSONB) -- roster construction
├── league_settings (JSONB) -- additional settings from Sleeper
├── draft_start_time (TIMESTAMP, optional)
├── draft_status (VARCHAR) -- "setup", "lobby", "drafting", "complete"
├── created_at (TIMESTAMP)
├── updated_at (TIMESTAMP)
└── deleted_at (TIMESTAMP, nullable) -- soft delete for commissioners who import wrong league
```

**Notes**:
- `sleeper_league_id` is stored for future reference/syncing if needed
- `draft_status` transitions: setup → lobby → drafting → complete
- `positions` is JSON to support flexible roster construction
- `league_settings` stores any additional Sleeper settings not explicitly modeled
- Soft delete with `deleted_at` allows recovery and avoids orphaning related records

---

### 3. `draft_settings`

Customizable draft configuration (separate from league configuration).

```sql
draft_settings
├── id (UUID, primary key)
├── league_id (FK → leagues.id, unique)
├── seconds_per_pick (INTEGER) -- e.g., 60
├── allow_pick_trading (BOOLEAN)
├── auto_draft_enabled (BOOLEAN)
├── auto_draft_type (VARCHAR) -- "ffc_adp" (default, free), "fantasypros_premium" (optional, requires commissioner-supplied key)
├── commissioner_id (FK → users.id)
├── created_at (TIMESTAMP)
└── updated_at (TIMESTAMP)
```

**Notes**:
- One row per league
- `allow_pick_trading` is in MVP scope. v1 trades support 2-team propose/accept/reject only; counter-offers are post-MVP (see [DRAFT_ENGINE.md](DRAFT_ENGINE.md#trade-offers))
- `auto_draft_type` determines how empty teams are drafted

---

### 4. `teams`

Teams within a league (imported from Sleeper, customizable in Draft House).

```sql
teams
├── id (UUID, primary key)
├── league_id (FK → leagues.id)
├── sleeper_user_id (VARCHAR, optional) -- null if no owner in Sleeper
├── owner_id (FK → users.id, nullable) -- Draft House owner
├── sleeper_team_name (VARCHAR)
├── draft_house_team_name (VARCHAR) -- editable
├── team_image_url (TEXT) -- originally from Sleeper
├── custom_image_url (TEXT, nullable) -- custom upload (separate from team_image_url)
├── draft_position (INTEGER) -- 1-12 for 12-team league
├── walk_up_song_url (TEXT, nullable) -- Supabase Storage URL
├── is_auto_draft (BOOLEAN)
├── family_league_wins (INTEGER) -- manually maintained by commissioner
├── team_anecdote (TEXT, nullable) -- commissioner-written anecdote
├── created_at (TIMESTAMP)
├── updated_at (TIMESTAMP)
```

**Notes**:
- Both `sleeper_team_name` and `draft_house_team_name` are stored (one is reference, one is editable)
- Images are separate: original from Sleeper, optional custom upload
- Walk-up song is stored in Supabase Storage; URL stored here
- `is_auto_draft` and `family_league_wins` are not synced to Sleeper (Draft House only)
- `team_anecdote` is manually entered by commissioner

---

### 5. `draft_state`

Current state of the live draft (one row per league).

```sql
draft_state
├── id (UUID, primary key)
├── league_id (FK → leagues.id, unique)
├── current_pick_number (INTEGER) -- 1, 2, 3, ...
├── current_team_id (FK → teams.id)
├── current_round (INTEGER)
├── timer_seconds (INTEGER) -- seconds remaining
├── timer_paused (BOOLEAN)
├── timer_active (BOOLEAN) -- false when commissioner has fully deactivated the timer (unlimited time)
├── timer_started_at (TIMESTAMP, nullable) -- when the current countdown began; clients derive remaining time from this
├── timer_restarted_at (TIMESTAMP, nullable) -- set whenever timer is edited or reset, so clients know to recalculate
├── timer_expired (BOOLEAN) -- true when current_team_id's timer hit 0 and they still haven't picked (jump-ahead is active)
├── timer_expired_at (TIMESTAMP, nullable)
├── expired_team_id (FK → teams.id, nullable) -- team with an outstanding expired pick, if any
├── pause_reason (VARCHAR, nullable) -- 'commissioner', 'pick_in_progress', 'trade_in_progress'
├── draft_started_at (TIMESTAMP, nullable)
├── draft_ended_at (TIMESTAMP, nullable)
├── draft_reset_at (TIMESTAMP, nullable) -- set each time commissioner resets the draft
├── updated_at (TIMESTAMP)
```

**Notes**:
- Single authoritative row for draft state (prevents race conditions)
- `timer_seconds` is server-calculated (not client-calculated)
- `timer_paused` allows commissioner to pause the draft
- Updated in real-time; Supabase subscriptions notify clients
- Draft lifecycle status ("setup"/"lobby"/"drafting"/"complete") lives on `leagues.draft_status`, not here — `draft_state` only tracks the live countdown/pick mechanics for a draft already in progress. See [DRAFT_ENGINE.md](DRAFT_ENGINE.md#timer-management) for how these fields are used together (jump-ahead, pause/resume, reset)

---

### 6. `picks`

History of all picks in a draft.

```sql
picks
├── id (UUID, primary key)
├── draft_state_id (FK → draft_state.id)
├── league_id (FK → leagues.id)
├── team_id (FK → teams.id)
├── sleeper_player_id (VARCHAR)
├── player_name (VARCHAR)
├── player_position (VARCHAR) -- e.g., "QB", "RB"
├── player_nfl_team (VARCHAR) -- e.g., "SF" (San Francisco)
├── player_bye (INTEGER) -- e.g., 10
├── pick_number (INTEGER) -- 1, 2, 3, ...
├── round (INTEGER)
├── pick_order_in_round (INTEGER)
├── created_at (TIMESTAMP)
└── updated_at (TIMESTAMP)
```

**Notes**:
- Immutable record of every pick
- `pick_number` is sequential across entire draft
- Includes all player metadata for later reference
- `updated_at` used if a pick is undone/reassigned
- Player headshots are never stored — they're built at render time from `sleeper_player_id` via Sleeper's public CDN template (see [SLEEPER.md](SLEEPER.md#player-photos))

---

### 7. `chat_messages`

Public activity feed messages (picks + chat).

```sql
chat_messages
├── id (UUID, primary key)
├── league_id (FK → leagues.id)
├── sender_id (FK → users.id)
├── message_type (VARCHAR) -- "pick", "message", "system"
├── content (TEXT)
├── pick_id (FK → picks.id, nullable) -- if message_type = "pick"
├── created_at (TIMESTAMP)
└── deleted_at (TIMESTAMP, nullable)
```

**Notes**:
- `message_type` distinguishes:
  - `"pick"`: Automated message when player is drafted
  - `"message"`: User-sent chat message
  - `"system"`: System notifications (draft paused, etc.)
- Only activity visible to all league members
- Soft delete for moderation (future feature)

---

### 8. `direct_messages`

Private messages between two users in a league context.

```sql
direct_messages
├── id (UUID, primary key)
├── conversation_id (FK → direct_message_conversations.id)
├── sender_id (FK → users.id)
├── recipient_id (FK → users.id)
├── content (TEXT)
├── read_at (TIMESTAMP, nullable)
├── created_at (TIMESTAMP)
```

**Notes**:
- Attached to a conversation (below)
- `read_at` null until recipient reads it
- Used for unread badge count and notifications
- Automatically set when user opens conversation
- See [CHAT.md](CHAT.md#direct-message-notifications) for notification implementation

---

### 9. `direct_message_conversations`

Represents a one-to-one conversation between two users in a league.

```sql
direct_message_conversations
├── id (UUID, primary key)
├── league_id (FK → leagues.id)
├── user_a_id (FK → users.id)
├── user_b_id (FK → users.id)
├── last_message_at (TIMESTAMP)
├── created_at (TIMESTAMP)
```

**Notes**:
- One conversation per user pair per league
- Ensures no duplicate conversations
- Constraint: `user_a_id < user_b_id` (alphabetic ordering to prevent duplication)

---

### 10. `reactions`

Emoji reactions to picks (activity feed).

```sql
reactions
├── id (UUID, primary key)
├── pick_id (FK → picks.id)
├── user_id (FK → users.id)
├── emoji (VARCHAR) -- e.g., "😂", "🔥"
├── created_at (TIMESTAMP)
```

**Notes**:
- Composite unique constraint on `(pick_id, user_id, emoji)` to prevent duplicate reactions
- User can react with multiple emoji to same pick
- User can change/remove reaction by deleting row

---

### 11. `rosters`

Tracks current roster for each team (denormalized from picks for performance).

```sql
rosters
├── id (UUID, primary key)
├── team_id (UUID, FK → teams.id, unique per league)
├── league_id (UUID, FK → leagues.id)
├── players (JSONB) -- array of player objects
├── bench_count (INTEGER)
├── total_players (INTEGER)
├── last_updated (TIMESTAMP)
└── created_at (TIMESTAMP)
```

**Notes**:
- Denormalized for performance (rosters shown frequently)
- Could be computed from picks table, but caching here improves performance
- `players` JSON stores: `[{sleeper_player_id, player_name, position, nfl_team}, ...]`
- Updated whenever a pick is made
- Used for displaying team rosters in lobby and draft room
- Can be recalculated from picks table at any time for consistency

**Example `players` field**:
```json
[
  {
    "sleeper_player_id": "2222",
    "player_name": "Bijan Robinson",
    "position": "RB",
    "nfl_team": "ATL",
    "bye": 10,
    "drafted_round": 1,
    "drafted_pick": 1
  },
  {
    "sleeper_player_id": "3333",
    "player_name": "Garrett Wilson",
    "position": "WR",
    "nfl_team": "NYJ",
    "bye": 9,
    "drafted_round": 1,
    "drafted_pick": 2
  }
]
```

---

### 12. `trade_offers`

Represents a proposed trade between two teams.

```sql
trade_offers
├── id (UUID, primary key)
├── league_id (UUID, FK → leagues.id)
├── proposing_team_id (UUID, FK → teams.id)
├── receiving_team_id (UUID, FK → teams.id)
├── status (VARCHAR) -- 'proposed', 'accepted', 'rejected', 'withdrawn', 'completed'
├── proposed_by_user_id (UUID, FK → users.id)
├── accepted_by_user_id (UUID, nullable, FK → users.id)
├── message (TEXT, nullable) -- Trade proposal message
├── created_at (TIMESTAMP)
├── responded_at (TIMESTAMP, nullable)
├── completed_at (TIMESTAMP, nullable)
└── deleted_at (TIMESTAMP, nullable)
```

**Notes**:
- `status` workflow: proposed → (accepted OR rejected OR withdrawn) → [optional: completed]
- `proposed_by_user_id` is owner of proposing_team_id
- `accepted_by_user_id` set when receiving_team_id owner accepts
- `message` allows proposer to explain the trade
- Soft-deleted for record-keeping
- Trade items (specific players/picks) stored in trade_offer_items table (below)

---

### 13. `trade_offer_items`

Individual players or picks included in a trade offer.

```sql
trade_offer_items
├── id (UUID, primary key)
├── trade_offer_id (UUID, FK → trade_offers.id)
├── from_team_id (UUID, FK → teams.id)
├── to_team_id (UUID, FK → teams.id)
├── item_type (VARCHAR) -- 'player', 'draft_pick'
├── sleeper_player_id (VARCHAR, nullable) -- if item_type = 'player'
├── player_name (VARCHAR, nullable) -- cached for display
├── draft_pick_id (VARCHAR, nullable) -- if item_type = 'draft_pick'
├── draft_pick_round (INTEGER, nullable) -- e.g., 3.05 → round 3, position 5
├── draft_pick_position (INTEGER, nullable)
└── created_at (TIMESTAMP)
```

**Notes**:
- One row per item in the trade (supports multi-item trades)
- Example: Trade A offers [Player X, 4th round pick] for Trade B's [Player Y, Player Z]
- `from_team_id` and `to_team_id` indicate direction of each item
- Allows asymmetric trades (e.g., 1 player for 2 players)
- `player_name` and `draft_pick_*` cached for display without joins
- Immutable (represents what was offered, not changed after)

**Example Trade Structure**:

Trade offer: Team A proposes trading
```
FROM Team A TO Team B:
  - Bijan Robinson (RB)
  - 4th round pick

FROM Team B TO Team A:
  - Garrett Wilson (WR)
```

Database rows:
```
trade_offers
├── id: trade_123
├── proposing_team_id: team_A
├── receiving_team_id: team_B
└── status: proposed

trade_offer_items
├── {trade_offer_id: trade_123, from_team_id: team_A, item_type: 'player', sleeper_player_id: '2222'}
├── {trade_offer_id: trade_123, from_team_id: team_A, item_type: 'draft_pick', draft_pick_round: 4, draft_pick_position: 5}
└── {trade_offer_id: trade_123, from_team_id: team_B, item_type: 'player', sleeper_player_id: '3333'}
```

---

### 14. `draft_board`

Tracks the status of each pick slot throughout the draft. Essential for managing expired picks and auto-slotting.

```sql
draft_board
├── id (UUID, primary key)
├── league_id (FK → leagues.id)
├── pick_number (INTEGER) -- 1-indexed pick slot (1, 2, 3, ..., total_picks)
├── assigned_team_id (FK → teams.id) -- team currently slated to make this pick
├── status (VARCHAR) -- 'pending', 'expired', 'completed'
├── pick_id (UUID, FK → picks.id, nullable) -- populated when pick is actually made
├── created_at (TIMESTAMP)
└── updated_at (TIMESTAMP)
```

**Notes**:
- One row per pick slot in the draft (e.g., 12 teams × 16 rounds = 192 rows)
- `status` tracks the state of each pick slot:
  - `'pending'`: Waiting for team to make a pick
  - `'expired'`: Timer ran out, team skipped (but can still pick if jump-ahead isn't triggered)
  - `'completed'`: Team made a pick
- `pick_id` links to the actual pick record once completed
- `assigned_team_id` mirrors `team_pick_assignments.current_owner_team_id` for this `pick_number` — kept in sync whenever a pick is traded, so auto-slotting never has to join through `team_pick_assignments` during live pick submission
- Used for auto-slotting: when expired team finally picks, system uses this table to insert pick at correct pick_number
- Enables efficient querying of draft progress (SELECT COUNT(*) WHERE status = 'completed')

**Example**:
```
pick_number: 1, status: 'completed', pick_id: pick_123 (Team 1 picked Player X)
pick_number: 2, status: 'completed', pick_id: pick_124 (Team 2 picked Player Y)
pick_number: 3, status: 'expired', pick_id: null (Team 3 timer expired, player jumped ahead)
pick_number: 4, status: 'pending', pick_id: null (Team 4 current player, timer active)
```

---

### 15. `team_pick_assignments`

Maps which team owns which draft picks. Enables pick ownership tracking through trades and forfeitures.

```sql
team_pick_assignments
├── id (UUID, primary key)
├── league_id (FK → leagues.id)
├── current_owner_team_id (UUID, FK → teams.id) -- team currently owning this pick
├── original_owner_team_id (UUID, FK → teams.id) -- original team assigned this pick (before trades)
├── pick_number (INTEGER) -- which pick slot (1, 2, 3, ..., total_picks)
├── round (INTEGER) -- round number (1-16)
├── position_in_round (INTEGER) -- position within the round (1-12 for 12-team league)
├── status (VARCHAR) -- 'active', 'forfeited', 'traded'
├── created_at (TIMESTAMP)
└── updated_at (TIMESTAMP)
```

**Notes**:
- One row per draft pick assigned to a team
- Tracks both original owner and current owner (after trades)
- `status = 'forfeited'` when team must skip pick due to roster limit violations
- Used for:
  - Determining which team picks next in snake draft
  - Validating trades (can only trade picks you own)
  - Identifying which picks are forfeited
  - Rebuilding draft state after undo/reset
- When trade occurs: creates new row with current_owner_team_id updated, keeps original_owner_team_id for history

**Example**:
```
Team A initially owns picks 1, 13, 25, 37, ... (1.01, 2.12, 3.01, 4.12, ...)
Team A trades pick 13 to Team B
  → Row updated: current_owner_team_id = Team B, status = 'traded'
Team A is warned about roster limit and must forfeit pick 37
  → Row updated: status = 'forfeited'
```

---

### 16. `user_preferences`

Per-user, per-league notification preferences for pick/trade announcements.

```sql
user_preferences
├── user_id (FK → users.id)
├── league_id (FK → leagues.id)
├── show_pick_announcements (BOOLEAN, default true)
├── show_trade_announcements (BOOLEAN, default true)
├── auto_dismiss_announcements (BOOLEAN, default true)
├── auto_dismiss_delay_ms (INTEGER, default 3500)
├── enable_announcement_sound (BOOLEAN, default true)
├── announcement_volume (FLOAT, default 0.6)
├── show_in_activity_feed (BOOLEAN, default true)
├── created_at (TIMESTAMP)
└── updated_at (TIMESTAMP)
```

**Notes**:
- Composite primary key `(user_id, league_id)` — one row per user per league, since preferences can differ across leagues
- Row is created lazily on first write (upsert); a missing row means defaults apply
- Read by clients before showing pick/trade announcement popups (see [DRAFT_ENGINE.md](DRAFT_ENGINE.md#notification-preferences--settings))

---

### 17. `draft_reset_archive`

Snapshot of a league's draft data taken immediately before a commissioner-triggered full draft reset.

```sql
draft_reset_archive
├── id (UUID, primary key)
├── league_id (FK → leagues.id)
├── reset_by_user_id (FK → users.id) -- commissioner who triggered the reset
├── archived_picks (JSONB) -- full snapshot of picks rows at time of reset
├── archived_messages (JSONB) -- full snapshot of chat_messages rows
├── archived_reactions (JSONB) -- full snapshot of reactions rows
└── archived_at (TIMESTAMP)
```

**Notes**:
- Written once per reset, immediately before `picks`, `chat_messages`, and `reactions` are cleared
- Exists purely for recovery/audit — not queried during normal draft operation
- See [DRAFT_ENGINE.md](DRAFT_ENGINE.md#5-reset-entire-draft) for the full reset flow

---

### 18. `audio_events`

Analytics log of walk-up music and draft chime playback.

```sql
audio_events
├── id (UUID, primary key)
├── user_id (FK → users.id)
├── league_id (FK → leagues.id)
├── event_type (VARCHAR) -- 'walkup_played', 'chime_played', 'mute_toggled'
├── metadata (JSONB, nullable) -- event-specific data, e.g. {team_id, song_url}
└── created_at (TIMESTAMP)
```

**Notes**:
- Write-only from the client during a draft; not read during normal draft operation
- Used solely for post-draft analytics (e.g., "how often is music muted")
- See [AUDIO.md](AUDIO.md#analytics--logging)

---

## Indexes

**Critical indexes** (to be finalized based on query patterns):

```sql
-- Lookups by user
CREATE INDEX idx_users_username ON users(username);

-- Lookups by league
CREATE INDEX idx_leagues_commissioner_id ON leagues(commissioner_id);
CREATE INDEX idx_leagues_sleeper_league_id ON leagues(sleeper_league_id);
CREATE INDEX idx_leagues_draft_status ON leagues(draft_status);

-- Lookups by team
CREATE INDEX idx_teams_league_id ON teams(league_id);
CREATE INDEX idx_teams_owner_id ON teams(owner_id);
CREATE INDEX idx_teams_draft_position ON teams(league_id, draft_position);

-- Real-time subscriptions
CREATE INDEX idx_draft_state_league_id ON draft_state(league_id);
CREATE INDEX idx_picks_league_id ON picks(league_id);
CREATE INDEX idx_picks_team_id ON picks(team_id);

-- Chat/messages
CREATE INDEX idx_chat_messages_league_id ON chat_messages(league_id);
CREATE INDEX idx_chat_messages_created_at ON chat_messages(league_id, created_at DESC);
CREATE INDEX idx_direct_messages_conversation_id ON direct_messages(conversation_id);
CREATE INDEX idx_direct_messages_recipient_read ON direct_messages(recipient_id, read_at);
CREATE INDEX idx_direct_messages_conversation_read ON direct_messages(conversation_id, read_at);
CREATE INDEX idx_reactions_pick_id ON reactions(pick_id);

-- Rosters
CREATE INDEX idx_rosters_team_id ON rosters(team_id);
CREATE INDEX idx_rosters_league_id ON rosters(league_id);

-- Trade offers
CREATE INDEX idx_trade_offers_league_id ON trade_offers(league_id);
CREATE INDEX idx_trade_offers_proposing_team_id ON trade_offers(proposing_team_id);
CREATE INDEX idx_trade_offers_receiving_team_id ON trade_offers(receiving_team_id);
CREATE INDEX idx_trade_offers_status ON trade_offers(league_id, status);
CREATE INDEX idx_trade_offer_items_trade_offer_id ON trade_offer_items(trade_offer_id);

-- Draft board
CREATE INDEX idx_draft_board_league_id ON draft_board(league_id);
CREATE INDEX idx_draft_board_pick_number ON draft_board(league_id, pick_number);
CREATE INDEX idx_draft_board_status ON draft_board(league_id, status);
CREATE INDEX idx_draft_board_assigned_team ON draft_board(league_id, assigned_team_id);

-- Team pick assignments
CREATE INDEX idx_team_pick_assignments_league_id ON team_pick_assignments(league_id);
CREATE INDEX idx_team_pick_assignments_current_owner ON team_pick_assignments(current_owner_team_id);
CREATE INDEX idx_team_pick_assignments_original_owner ON team_pick_assignments(original_owner_team_id);
CREATE INDEX idx_team_pick_assignments_pick_number ON team_pick_assignments(league_id, pick_number);

-- User preferences
CREATE INDEX idx_user_preferences_league_id ON user_preferences(league_id);

-- Draft reset archive
CREATE INDEX idx_draft_reset_archive_league_id ON draft_reset_archive(league_id);

-- Audio events
CREATE INDEX idx_audio_events_league_id ON audio_events(league_id);
CREATE INDEX idx_audio_events_user_id ON audio_events(user_id);
```

---

## Relationships

```
users (1) ──→ (∞) leagues (commissioner)
  ↓
  ├─→ (∞) teams (owner)
  ├─→ (∞) chat_messages (sender)
  ├─→ (∞) direct_messages (sender/recipient)
  ├─→ (∞) trade_offers (proposer)
  ├─→ (∞) user_preferences (one per league)
  └─→ (∞) audio_events

leagues (1) ──→ (∞) teams
  ↓
  ├─→ (1) draft_state
  ├─→ (∞) picks
  ├─→ (∞) rosters
  ├─→ (∞) chat_messages
  ├─→ (∞) direct_message_conversations
  ├─→ (∞) trade_offers
  ├─→ (∞) draft_board (one row per pick slot)
  ├─→ (∞) team_pick_assignments (one row per team's pick ownership)
  ├─→ (∞) user_preferences
  ├─→ (∞) draft_reset_archive
  └─→ (∞) audio_events

teams (1) ──→ (∞) picks
  ├─→ (1) roster
  ├─→ (∞) reactions
  └─→ (∞) draft_board (as assigned_team_id)

teams (1) ──→ (∞) trade_offers (proposing or receiving)

draft_state (1) ──→ (∞) picks

picks (1) ──→ (∞) reactions
  ↓
  └─→ (1) chat_message (pick announcement)

trade_offers (1) ──→ (∞) trade_offer_items

direct_message_conversations (1) ──→ (∞) direct_messages

draft_board (1) ──→ (1) picks (when completed)

teams (1) ──→ (∞) team_pick_assignments (as current_owner or original_owner)
```

---

## Key Design Decisions

### 1. Soft Deletes for Leagues

Leagues are soft-deleted (not hard-deleted) because:
- Preserves referential integrity with picks, chat, etc.
- Allows recovery if commissioner changes mind
- Keeps historical record intact

### 2. Separate Sleeper References

- `sleeper_league_id`, `sleeper_user_id`, `sleeper_player_id` are stored for reference
- Allows future Sleeper re-sync without re-importing
- Makes it clear that Draft House is independent after import

### 3. Image Handling

- Both `sleeper_team_name` and `team_image_url` are preserved
- Custom fields (`draft_house_team_name`, `custom_image_url`) are separate
- Simplifies undo/reset logic

### 4. JSONB for Flexible Settings

- `league_settings` and `positions` use JSONB to handle variations
- Avoids rigid schema that breaks with Sleeper API changes
- Query-able with PostgreSQL JSON operators if needed

### 5. Real-Time Subscriptions

- `draft_state` is a single authoritative row (prevents race conditions)
- Changes to `draft_state`, `picks`, `reactions`, and `chat_messages` trigger real-time events
- Clients subscribe to relevant events and update UI

### 6. Direct Message Model

- Conversations are explicitly modeled (one per user pair per league)
- Prevents accidental duplicate conversations
- Supports future features (unread counts, conversation state)

---

## Constraints & Validation

### Unique Constraints

```sql
UNIQUE(users.username)
UNIQUE(users.auth_email)
UNIQUE(leagues.sleeper_league_id)
UNIQUE(leagues.commissioner_id, leagues.id) -- implicit (PK)
UNIQUE(draft_state.league_id)
UNIQUE(direct_message_conversations.league_id, user_a_id, user_b_id)
UNIQUE(reactions.pick_id, user_id, emoji)
UNIQUE(user_preferences.user_id, league_id)
```

### Check Constraints

```sql
-- Draft state
CHECK(timer_seconds >= 0)
CHECK(current_round >= 1)

-- Picks
CHECK(pick_number >= 1)
CHECK(round >= 1)

-- Teams (user_a_id < user_b_id for conversations)
CHECK(user_a_id < user_b_id)
```

### Referential Integrity

- All foreign keys cascade on delete (handled by database)
- Transactions ensure consistency during draft operations

---

## Data Deletion Policy

### User Deletes Their Account

- User record deleted
- Teams are unassigned (owner_id → null)
- Chat messages and DMs are deleted
- Reactions are deleted
- Picks remain (historical record)

### Commissioner Deletes League

- League soft-deleted (`deleted_at` set)
- All child records remain (historical)
- Soft delete allows recovery

### Undo a Pick

- Pick record is deleted or marked as "undone"
- Subsequent picks may need to reorder
- (TBD: exact undo behavior)

---

## Query Patterns

### Join Draft Lobby

```sql
SELECT id, draft_house_team_name, draft_position, owner_id
FROM teams
WHERE league_id = ?
ORDER BY draft_position ASC;
```

### Get Draft State + Current Team

```sql
SELECT ds.*, t.draft_house_team_name, t.owner_id
FROM draft_state ds
LEFT JOIN teams t ON ds.current_team_id = t.id
WHERE ds.league_id = ?;
```

### Get Chat/Activity Feed (Paginated)

```sql
SELECT id, sender_id, message_type, content, created_at, pick_id
FROM chat_messages
WHERE league_id = ?
ORDER BY created_at DESC
LIMIT 50 OFFSET 0;
```

### Check if User Can Own Team

```sql
SELECT owner_id FROM teams WHERE id = ? AND owner_id IS NULL;
```

---

## Data Retention & Archival

**Decision**: Keep everything indefinitely — no scheduled purge job. This is a private league of ~12 people drafting once a year; a full season's chat, DMs, reactions, and walk-up songs are trivial against Supabase's free-tier storage limits, and there's real value in letting a family league look back at old drafts. Soft-deleted leagues (`leagues.deleted_at`) keep all child records for the same reason (see [Key Design Decisions](#1-soft-deletes-for-leagues)).

If storage ever becomes a real concern (unlikely at this scale), the first lever is walk-up song files in Supabase Storage, not database rows — chat/pick/reaction text is negligible by comparison.

---

## TBD: Performance Tuning

- Partition large tables (picks, chat_messages) by draft date?
- Materialized views for common queries?
- Caching strategy for leaderboards (if added)?

---

## Migration Strategy

**Supabase CLI migrations** (`supabase migration new`, `supabase db push`) — Alembic and Flyway don't fit this stack (Python/Java-oriented tooling on a Next.js + Supabase project), and the Supabase CLI is already the natural fit for a Postgres project managed through Supabase. Migration files are checked into the repo under `supabase/migrations/` for reproducibility across local and hosted environments.

---

## See Also

- [ARCHITECTURE.md](../ARCHITECTURE.md) — Overall application design
- [SLEEPER.md](SLEEPER.md) — Data mapping from Sleeper import
- [DRAFT_ENGINE.md](DRAFT_ENGINE.md) — Draft logic and pick validation
- [AGENTS.md](../AGENTS.md) — Project overview
