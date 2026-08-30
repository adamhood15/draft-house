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
├── sleeper_user_id (VARCHAR, optional, unique) -- set the first time this user looks up leagues by Sleeper username
├── sleeper_username (VARCHAR, optional) -- the Sleeper username that resolved to sleeper_user_id
├── created_at (TIMESTAMP)
└── updated_at (TIMESTAMP)
```

**Notes**:
- Username is unique across the application
- Display name is the name shown in leagues and chat
- Avatar is optional (may be used for team profile popups)
- Passwords managed entirely by Supabase Auth (never directly in application)
- `sleeper_user_id`/`sleeper_username` are set best-effort the first time a commissioner looks up leagues to import (see [SLEEPER.md](SLEEPER.md#import-flow)) — this remembers their Sleeper identity so the username is never asked for twice, and lets the home page show their other not-yet-imported Sleeper leagues. Deliberately not a cached leagues list — that's fetched live from Sleeper each time, since a stored snapshot would drift as league membership changes.
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
├── rosters_per_team (INTEGER)
├── positions (JSONB) -- roster construction
├── league_settings (JSONB) -- additional settings from Sleeper
├── invite_token (UUID, unique) -- shareable invite link is /invite/{invite_token}
├── created_at (TIMESTAMP)
├── updated_at (TIMESTAMP)
└── deleted_at (TIMESTAMP, nullable) -- soft delete for commissioners who import wrong league
```

**Notes**:
- `sleeper_league_id` is stored for future reference/syncing if needed
- **Nothing draft-shaped lives here.** The order type, scheduled start and lifecycle status are all
  on [`drafts`](#3-drafts). They were columns here once, which meant the settings form wrote the
  draft's configuration to two tables with no transaction spanning them — so the pick timer could
  save while the draft order did not.
- `rosters_per_team` is the league's roster construction (the sum of `positions`), which is *not* the
  same as the draft's round count. A rookie draft fills a few rounds onto rosters with twenty-odd
  slots, so the board's length is `drafts.rounds` and this column is not a second opinion on it.
- `positions` is JSON to support flexible roster construction
- `league_settings` stores any additional Sleeper settings not explicitly modeled
- Soft delete with `deleted_at` allows recovery and avoids orphaning related records
- `invite_token` is separate from `id` so the link can be regenerated (invalidating the old one) without touching the league's real identity. Auto-generated at import time — see [SLEEPER.md](SLEEPER.md#import-flow). Looking a league up by `invite_token` necessarily happens before the viewer is a league member, so it goes through the admin client like import does — see `leagues_select`'s `is_league_member` requirement in [REALTIME.md](REALTIME.md#security--authorization).

---

### 3. `drafts`

The draft itself — one row per league, shaped after Sleeper's draft object. Absorbs what used to be
three places: `draft_settings` (configuration), `draft_state` (the live clock), and the draft
columns on `leagues` (`draft_format`, `draft_start_time`, `draft_status`).

```sql
drafts
├── id (UUID, primary key)
├── league_id (FK → leagues.id, UNIQUE) -- one draft per league; current season only
├── sleeper_draft_id (VARCHAR, nullable)
│
│   -- Sleeper's own top-level fields
├── type (VARCHAR) -- "snake" | "linear" (src/lib/draft/order.ts)
├── status (VARCHAR) -- "setup" | "lobby" | "drafting" | "paused" | "complete"
├── sport (VARCHAR) -- "nfl"
├── season (INTEGER)
├── season_type (VARCHAR) -- "regular"
├── start_time (TIMESTAMP, nullable) -- scheduled kickoff; Sleeper sends epoch ms
├── settings (JSONB) -- Sleeper's settings object, verbatim
├── metadata (JSONB) -- Sleeper's metadata object (scoring_type, name, description), verbatim
├── draft_order (JSONB, nullable) -- Sleeper user_id → draft slot
├── slot_to_roster_id (JSONB, nullable) -- draft slot → Sleeper roster_id
│
│   -- promoted out of settings, because the application enforces them
├── rounds (INTEGER)
├── pick_timer (INTEGER) -- seconds per pick; 0 = unlimited (Sleeper's convention)
│
│   -- Draft House settings with no Sleeper equivalent
├── allow_pick_trading (BOOLEAN)
├── auto_draft_enabled (BOOLEAN)
├── auto_draft_type (VARCHAR) -- "ffc_adp" (default, free), "fantasypros_premium" (optional, requires commissioner-supplied key)
│
│   -- live clock (was draft_state)
├── current_pick_no (INTEGER)
├── current_round (INTEGER)
├── current_team_id (FK → teams.id, nullable)
├── timer_seconds (INTEGER) -- seconds remaining on the CURRENT pick
├── timer_active (BOOLEAN) -- false when the commissioner has deactivated the clock
├── timer_paused (BOOLEAN)
├── timer_started_at (TIMESTAMP, nullable) -- when the current countdown began
├── timer_restarted_at (TIMESTAMP, nullable) -- set whenever the timer is edited or reset
├── timer_expired (BOOLEAN) -- true when current_team_id's clock hit 0 without a pick
├── timer_expired_at (TIMESTAMP, nullable)
├── expired_team_id (FK → teams.id, nullable)
├── last_picked_at (TIMESTAMP, nullable) -- Sleeper's `last_picked`
├── started_at (TIMESTAMP, nullable)
├── ended_at (TIMESTAMP, nullable)
├── reset_at (TIMESTAMP, nullable) -- set each time the commissioner resets the draft
├── created_at (TIMESTAMP)
└── updated_at (TIMESTAMP)
```

**Notes**:
- One row per league, created at import. It always exists, so `status` is never null and there is no
  window where a league has no draft state.
- `status` transitions: setup → lobby → drafting → complete, with `paused` reachable from drafting.
  Sleeper collapses the first two into its own `pre_draft`; Draft House needs them apart because the
  setup flow and `startDraft`'s mutex both key off the distinction. Import maps `pre_draft` → `setup`.
- **`settings` and `metadata` are provenance, not configuration.** They hold Sleeper's objects
  verbatim so a field we did not anticipate is not lost, and the promoted columns (`rounds`,
  `pick_timer`) are authoritative. Reading `settings->>'pick_timer'` instead of `pick_timer` is the
  bug this arrangement exists to prevent.
- `pick_timer` is one column where there were two. "No timer" is `pick_timer = 0` — Sleeper's own
  convention — and it seeds `timer_active` at draft load. Two columns could contradict each other
  about the same fact; one cannot.
- `timer_seconds` is *not* a duplicate of `pick_timer`: it is the current pick's countdown, which a
  commissioner can adjust for a single pick without changing the league default. See
  [TIMER.md](TIMER.md#timer-management).
- `allow_pick_trading` is in MVP scope. v1 trades support 2-team propose/accept/reject only;
  counter-offers are post-MVP (see [TRADES.md](TRADES.md#trade-offers)).
- **Writes are split.** `drafts_update` RLS lets the commissioner change the settings, and a column
  grant restricts that to `type`, `status`, `start_time`, `pick_timer`, `allow_pick_trading`,
  `auto_draft_enabled`, `auto_draft_type`. Every clock column is service-role only — RLS restricts
  rows, not columns, so the grant is what keeps `current_pick_no` out of the browser's reach. See
  [SECURITY.md](SECURITY.md#row-level-security-rls).

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
- Team owner (or the commissioner) edits name/image/song at `/leagues/{id}/team` — prompted once right after claiming (see [ARCHITECTURE.md](ARCHITECTURE.md)'s Player Entry Flow), and revisitable anytime after. See [AUDIO.md](AUDIO.md#upload-technical-details) for the storage bucket layout.
- `is_auto_draft` and `family_league_wins` are not synced to Sleeper (Draft House only)
- `team_anecdote` is manually entered by commissioner

---

### 5. `draft_picks`

Every slot on the board, and the pick made in it. One row per slot, all generated when the draft
starts. Replaces three tables: `picks`, `draft_board` (slot status) and `team_pick_assignments`
(slot ownership).

```sql
draft_picks
├── id (UUID, primary key)
├── draft_id (FK → drafts.id)
├── league_id (FK → leagues.id) -- denormalized so RLS is a plain is_league_member() call
├── pick_no (INTEGER) -- global pick number, 1..(league_size × rounds)
├── round (INTEGER)
├── draft_slot (INTEGER) -- the SEAT that owns the slot; matches teams.draft_position
├── team_id (FK → teams.id) -- who owns the pick NOW
├── original_team_id (FK → teams.id) -- who owned it when the board was generated
├── picked_by (FK → users.id, nullable) -- the person who submitted it; null for auto-drafted
├── status (VARCHAR) -- "pending" | "expired" | "completed" | "forfeited"
├── sleeper_player_id (VARCHAR, nullable) -- null until the pick is made
├── player_name (VARCHAR, nullable)
├── player_position (VARCHAR, nullable) -- e.g., "QB", "RB"
├── player_nfl_team (VARCHAR, nullable) -- e.g., "SF"
├── is_keeper (BOOLEAN)
├── picked_at (TIMESTAMP, nullable)
├── created_at (TIMESTAMP)
└── updated_at (TIMESTAMP)
```

**Notes**:
- One row per pick slot (e.g., 12 teams × 16 rounds = 192 rows), written by `startDraft`.
- **A traded pick is `team_id <> original_team_id`.** There is no "traded" status to remember to
  write, and no second table to keep in sync. `draft_board.assigned_team_id` used to be a
  hand-maintained mirror of `team_pick_assignments.current_owner_team_id`, on the hottest path in
  the app — every trade had to write both or the board quietly misreported who owned a pick.
- **The slot and the pick are one row**, so they cannot disagree about whether a pick happened. The
  old split — `draft_board.status` plus `draft_board.pick_id` plus the existence of a `picks` row —
  was three representations of one fact.
- `draft_slot` is the seat, matching Sleeper's field of the same name and the keys of
  `drafts.slot_to_roster_id`. It is **not** the place in the round's sequence, which mirrors on even
  rounds of a snake and is derived by `src/lib/draft/order.ts` rather than stored — a stored copy
  could drift from the pick number it is supposed to describe.
- `status = 'expired'` means the clock ran out and the team was skipped; they can still pick if
  jump-ahead has not fired. `status = 'forfeited'` means the team must skip on a roster-limit
  violation. See [TIMER.md](TIMER.md#pick-expiration--jump-ahead).
- A `completed` row must carry a `sleeper_player_id`, enforced by CHECK.
- Player headshots are never stored — they're built at render time from `sleeper_player_id` via
  Sleeper's public CDN template (see [SLEEPER.md](SLEEPER.md#player-photos)).
- Bye weeks are **not** stored here. They are a function of (season, team) with 32 distinct values,
  so they live in `team_bye_weeks` and join on `player_nfl_team`.

---

### 6. `chat_messages`

Public activity feed messages (picks + chat).

```sql
chat_messages
├── id (UUID, primary key)
├── league_id (FK → leagues.id)
├── sender_id (FK → users.id)
├── message_type (VARCHAR) -- "pick", "message", "system"
├── content (TEXT)
├── pick_id (FK → draft_picks.id, nullable) -- if message_type = "pick"
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

### 7. `direct_messages`

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

### 8. `direct_message_conversations`

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

### 9. `reactions`

Emoji reactions to picks (activity feed).

```sql
reactions
├── id (UUID, primary key)
├── pick_id (FK → draft_picks.id)
├── user_id (FK → users.id)
├── emoji (VARCHAR) -- e.g., "😂", "🔥"
├── created_at (TIMESTAMP)
```

**Notes**:
- Composite unique constraint on `(pick_id, user_id, emoji)` to prevent duplicate reactions
- User can react with multiple emoji to same pick
- User can change/remove reaction by deleting row

---

### 10. `rosters`

Tracks current roster for each team (denormalized from draft_picks for performance).

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
- Could be computed from draft_picks, but caching here improves performance
- `players` JSON stores: `[{sleeper_player_id, player_name, position, nfl_team}, ...]`
- Updated whenever a pick is made
- Used for displaying team rosters in lobby and draft room
- Can be recalculated from draft_picks at any time for consistency

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

### 11. `trade_offers`

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

### 12. `trade_offer_items`

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

### 13. `user_preferences`

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
- Read by clients before showing pick/trade announcement popups (see [NOTIFICATIONS.md](NOTIFICATIONS.md#notification-preferences--settings))

---

### 14. `draft_reset_archive`

Snapshot of a league's draft data taken immediately before a commissioner-triggered full draft reset.

```sql
draft_reset_archive
├── id (UUID, primary key)
├── league_id (FK → leagues.id)
├── reset_by_user_id (FK → users.id) -- commissioner who triggered the reset
├── archived_picks (JSONB) -- full snapshot of draft_picks rows at time of reset
├── archived_messages (JSONB) -- full snapshot of chat_messages rows
├── archived_reactions (JSONB) -- full snapshot of reactions rows
└── archived_at (TIMESTAMP)
```

**Notes**:
- Written once per reset, immediately before `draft_picks`, `chat_messages`, and `reactions` are cleared
- Exists purely for recovery/audit — not queried during normal draft operation
- See [COMMISSIONER.md](COMMISSIONER.md#5-reset-entire-draft) for the full reset flow

---

### 15. `audio_events`

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

### 16. `players`

The NFL player cache — a field-for-field mirror of Sleeper's `GET /players/nfl`, refreshed at most
once per day. League-independent reference data.

```sql
players
├── player_id (VARCHAR, primary key) -- Sleeper's id; what draft_picks.sleeper_player_id holds
├── first_name, last_name, full_name, hashtag (VARCHAR)
├── search_first_name, search_last_name, search_full_name (VARCHAR)
├── search_rank (INTEGER) -- Sleeper's search ordering; 9999999 = unranked
├── player_shard (VARCHAR)
├── position, fantasy_positions (JSONB), depth_chart_position (VARCHAR)
├── depth_chart_order, number (INTEGER)
├── team (VARCHAR, nullable) -- joins team_bye_weeks.team; null for free agents
├── team_abbr (VARCHAR), team_changed_at (TIMESTAMP)
├── status, active, injury_status, injury_body_part, injury_notes
├── injury_start_date (DATE), practice_participation, practice_description
├── news_updated (TIMESTAMP)
├── age, years_exp (INTEGER), birth_date (DATE)
├── birth_city, birth_state, birth_country, college, high_school (VARCHAR)
├── height, weight (VARCHAR) -- strings on Sleeper; stored as sent
├── sport (VARCHAR), competitions (JSONB), metadata (JSONB)
├── espn_id, yahoo_id, rotowire_id, rotoworld_id, stats_id, swish_id, fantasy_data_id (INTEGER)
├── sportradar_id, gsis_id, oddsjam_id, kalshi_id, pandascore_id, opta_id (VARCHAR)
└── synced_at (TIMESTAMP)
```

**Notes**:
- Verified against the live endpoint on 2026-08-30: 12,225 players, 53 keys, and **every key present
  on every player** — Sleeper sends nulls rather than omitting fields.
- **Only `active = true` is stored** (9,418 of 12,225). An inactive player should not be draftable.
  Note that 6,358 of the survivors are free agents with `team = null`, so they have no bye week.
- A player who flips to `active = false` disappears on the next sync. Completed boards survive that
  because `draft_picks` denormalizes the player's name, position and team at pick time — those
  columns are load-bearing, not merely convenient.
- **No provenance JSONB here**, unlike `drafts`. That copy exists because a league's settings become
  unrecoverable once changed upstream; this payload is refetched daily, so a second copy would earn
  nothing but storage. The columns *are* the mirror.
- `height`, `weight` and `player_shard` arrive as strings and stay strings. Parsing them would
  invent a schema Sleeper did not send, and the first unparseable value becomes a failed sync.
- `search_rank` is Sleeper's search ordering, **not** a fantasy ranking. Values come from
  `player_values`.

---

### 17. `team_bye_weeks`

Bye week per NFL team per season. Sleeper's player payload carries no bye week — confirmed absent
across all 12,225 players — so it is derived from the NFL schedule: a team with no game in week W has
its bye in week W (`src/lib/espn/bye-weeks.ts`).

```sql
team_bye_weeks
├── season (INTEGER)   ┐ composite primary key
├── team (VARCHAR)     ┘ SLEEPER's abbreviation — this column exists to join players.team
├── bye_week (INTEGER) -- CHECK between 1 and 18
└── synced_at (TIMESTAMP)
```

**Notes**:
- **A table, not a column on `players`.** A bye week is a function of (season, team): across ~3,000
  rostered players there are exactly 32 distinct answers. Denormalizing it would mean rewriting
  thousands of rows on every daily sync, and again whenever anyone changes teams, to store 32 facts.
- `team` speaks **Sleeper's** vocabulary; the schedule source is normalized into it on write, never
  the other way around. The two disagree: Sleeper says `WAS`, ESPN says `WSH`. Joined naively, every
  Washington player gets a null bye — no error, just a blank column nobody notices until someone
  drafts their kicker.
- Sleeper also still tags some active players to `OAK`, a team that has not existed since 2019. Those
  resolve to no bye, which is correct — mapping them to `LV` would be a guess dressed as data.
- Derivation refuses if any week of the schedule is missing rather than inferring: one failed request
  reads as "nobody played that week" and would hand all 32 teams the same false bye.

---

### 18. `player_values`

Player values from [Dynasty Dealer](https://www.dynastydealer.com), the ranking source for auto-draft
and best-available ordering.

> **Attribution is a license condition, not a courtesy.** The API is free for any use — personal,
> commercial or content — on one condition: a visible link to dynastydealer.com ("Values by Dynasty
> Dealer") wherever the values appear. Anywhere a value, a rank, or a best-available ordering derived
> from these rows reaches a screen, that attribution has to be on it.

```sql
player_values
├── sleeper_player_id (VARCHAR)  ┐
├── format (VARCHAR)             │ composite primary key
├── scoring (VARCHAR)            │ format: "dynasty" | "redraft"; scoring is "na" for dynasty
├── superflex (BOOLEAN)          ┘
├── current_value (INTEGER) -- the ranking signal; 0–10,000 scale
├── base_value (INTEGER) -- raw engine number, before community vote adjustment
├── name, position, team (VARCHAR), age (INTEGER)
├── value_updated_at (TIMESTAMP) -- the API's per-row updated_at
├── proj_pts_ppr, proj_pts_half, proj_pts_std (NUMERIC) -- redraft only
├── is_rookie (BOOLEAN), season (INTEGER) -- redraft only
└── synced_at (TIMESTAMP)
```

**Notes**:
- `GET https://www.dynastydealer.com/api/player-values` — no auth, no key, CORS `*`, edge-cached 60s.
  A daily fetch is what the docs recommend and what Draft House does.
- **Use `current_value`, not `base_value`** — it is the engine number after community vote
  adjustment, and the API docs are explicit about it. The dynasty model's vote fields
  (`calc_bonus`, `votes`, `vote_rating`, `vote_impact_percent`) are deliberately not stored: keeping
  the inputs to a number we never recompute would be storing the arithmetic behind it.
- **Rank is not stored.** It is `ORDER BY current_value DESC`, so it cannot disagree with the value it
  came from.
- Values are multi-row per player by nature — the same player carries different numbers in half-PPR
  than in PPR, and different again in superflex — which is why this cannot be columns on `players`.
  `scoring` maps `leagues.scoring_format` onto the API's parameter: `std`→`std`, `half_ppr`→`half`,
  `ppr`→`ppr`.
- **No foreign key to `players`.** The two sync independently, `players` is filtered to
  `active = true`, and the dynasty feed carries 36 `PICK` rows that are not players at all. A FK would
  turn any of those ordinary mismatches into a failed nightly sync.
- **Coverage gap:** the feed is top-1000 and offense-only — QB, RB, WR, TE and nothing else. There are
  **zero K, DEF or IDP rows**. A league with those slots gets no values for them, so auto-draft and
  best-available must degrade for those positions rather than read a missing row as zero, which would
  rank every defensive player below every offensive one.

---

## Indexes

**Critical indexes** (to be finalized based on query patterns):

```sql
-- Lookups by user
CREATE INDEX idx_users_username ON users(username);

-- Lookups by league
CREATE INDEX idx_leagues_commissioner_id ON leagues(commissioner_id);
CREATE INDEX idx_leagues_sleeper_league_id ON leagues(sleeper_league_id);

-- Lookups by team
CREATE INDEX idx_teams_league_id ON teams(league_id);
CREATE INDEX idx_teams_owner_id ON teams(owner_id);
CREATE INDEX idx_teams_draft_position ON teams(league_id, draft_position);

-- Drafts (league_id is already indexed by its UNIQUE constraint)
CREATE INDEX idx_drafts_status ON drafts(status);
CREATE INDEX idx_drafts_current_team ON drafts(current_team_id);

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

-- Draft picks ((draft_id, pick_no) is covered by the unique slot constraint)
CREATE INDEX idx_draft_picks_league_id ON draft_picks(league_id);
CREATE INDEX idx_draft_picks_team ON draft_picks(league_id, team_id);
CREATE INDEX idx_draft_picks_original_team ON draft_picks(league_id, original_team_id);
CREATE INDEX idx_draft_picks_status ON draft_picks(league_id, status);

-- User preferences
CREATE INDEX idx_user_preferences_league_id ON user_preferences(league_id);

-- Draft reset archive
CREATE INDEX idx_draft_reset_archive_league_id ON draft_reset_archive(league_id);

-- Audio events
CREATE INDEX idx_audio_events_league_id ON audio_events(league_id);
CREATE INDEX idx_audio_events_user_id ON audio_events(user_id);

-- Reference data
CREATE INDEX idx_players_synced_at ON players(synced_at DESC); -- the once-per-day gate reads max(synced_at)
CREATE INDEX idx_players_position ON players(position);
CREATE INDEX idx_players_team ON players(team);
CREATE INDEX idx_players_search_full_name ON players(search_full_name);
CREATE INDEX idx_player_values_player ON player_values(sleeper_player_id);
CREATE INDEX idx_player_values_ranking ON player_values(format, scoring, superflex, current_value DESC);
CREATE INDEX idx_player_values_synced_at ON player_values(synced_at DESC);
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
  ├─→ (1) drafts
  ├─→ (∞) draft_picks
  ├─→ (∞) rosters
  ├─→ (∞) chat_messages
  ├─→ (∞) direct_message_conversations
  ├─→ (∞) trade_offers
  ├─→ (∞) user_preferences
  ├─→ (∞) draft_reset_archive
  └─→ (∞) audio_events

drafts (1) ──→ (∞) draft_picks (one row per pick slot)
  └─→ (1) teams (as current_team_id / expired_team_id)

teams (1) ──→ (∞) draft_picks (as team_id and as original_team_id)
  ├─→ (1) roster
  └─→ (∞) trade_offers (proposing or receiving)

draft_picks (1) ──→ (∞) reactions
  ↓
  └─→ (1) chat_message (pick announcement)

trade_offers (1) ──→ (∞) trade_offer_items

direct_message_conversations (1) ──→ (∞) direct_messages

players (1) ──→ (∞) player_values (by sleeper_player_id; no FK — see §18)
players (∞) ──→ (1) team_bye_weeks (by season + team)
```

Reference tables (`players`, `team_bye_weeks`, `player_values`) hang off no league — they are the same
NFL data for everyone, which is why their RLS is `to authenticated using (true)` rather than an
`is_league_member` check.

---

## Key Design Decisions

### 1. Soft Deletes for Leagues

Leagues are soft-deleted (not hard-deleted) because:
- Preserves referential integrity with draft_picks, chat, etc.
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

- `drafts` is a single authoritative row per league (prevents race conditions), which also means realtime has one row to subscribe to for the whole draft rather than three
- Changes to `drafts`, `draft_picks`, `reactions`, and `chat_messages` trigger real-time events
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
UNIQUE(drafts.league_id) -- one draft per league
UNIQUE(draft_picks.draft_id, pick_no) -- one row per slot
UNIQUE(draft_picks.league_id, sleeper_player_id) -- nulls don't conflict, so unmade slots coexist
UNIQUE(direct_message_conversations.league_id, user_a_id, user_b_id)
UNIQUE(reactions.pick_id, user_id, emoji)
UNIQUE(user_preferences.user_id, league_id)
```

### Check Constraints

```sql
-- Drafts
CHECK(type IN ('snake', 'linear'))
CHECK(status IN ('setup', 'lobby', 'drafting', 'paused', 'complete'))
CHECK(rounds >= 1)
CHECK(pick_timer >= 0) -- 0 is "unlimited", NOT a floor: the settings form applies a 10s minimum
                       -- to what a commissioner may type, but Sleeper can send any value and the
                       -- import writes it verbatim. A database floor would reject a real league.
CHECK(timer_seconds >= 0)
CHECK(current_round >= 1)
CHECK(current_pick_no >= 1)

-- Draft picks
CHECK(pick_no >= 1)
CHECK(round >= 1)
CHECK(draft_slot >= 1)
CHECK(status IN ('pending', 'expired', 'completed', 'forfeited'))
CHECK(status <> 'completed' OR sleeper_player_id IS NOT NULL)

-- Leagues
CHECK(scoring_format IN ('std', 'half_ppr', 'ppr'))

-- Reference data
CHECK(team_bye_weeks.bye_week BETWEEN 1 AND 18)
CHECK(player_values.format IN ('dynasty', 'redraft'))
CHECK((format = 'dynasty' AND scoring = 'na') OR (format = 'redraft' AND scoring IN ('std', 'half', 'ppr')))
CHECK(player_values.current_value >= 0)

-- Conversations (user_a_id < user_b_id)
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

- The slot's row stays; its player columns are cleared and `status` returns to `pending`. Deleting
  the row would delete the slot itself, which is a different and much worse thing — the board would
  come back a pick short.
- Nothing needs reordering. `pick_no`, `round` and `draft_slot` describe the slot, not the pick, so
  they are unaffected by what lands in it.
- `reactions` and `chat_messages` referencing the pick cascade or clear per their FKs.
- (TBD: exact undo behavior for picks that are not the most recent.)

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
SELECT d.*, t.draft_house_team_name, t.owner_id
FROM drafts d
LEFT JOIN teams t ON d.current_team_id = t.id
WHERE d.league_id = ?;
```

### Render the Board

One query, because the slot and the pick in it are the same row:

```sql
SELECT pick_no, round, draft_slot, team_id, original_team_id, status,
       sleeper_player_id, player_name, player_position, player_nfl_team
FROM draft_picks
WHERE league_id = ?
ORDER BY pick_no ASC;
```

### Best Available, With Bye Weeks

```sql
SELECT p.player_id, p.full_name, p.position, p.team, b.bye_week, v.current_value
FROM players p
LEFT JOIN player_values v
  ON v.sleeper_player_id = p.player_id
 AND v.format = 'redraft' AND v.scoring = ? AND v.superflex = ?
LEFT JOIN team_bye_weeks b
  ON b.team = p.team AND b.season = ?
WHERE p.player_id NOT IN (
  SELECT sleeper_player_id FROM draft_picks
  WHERE league_id = ? AND sleeper_player_id IS NOT NULL
)
ORDER BY v.current_value DESC NULLS LAST;
```

`NULLS LAST` is load-bearing: K, DEF and IDP players have no value row at all (see §18), and treating
a missing value as zero would rank every one of them below every offensive player.

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

- Partition large tables (draft_picks, chat_messages) by draft date?
- Materialized views for common queries?
- Caching strategy for leaderboards (if added)?

---

## Migration Strategy

**Supabase CLI migrations** (`supabase migration new`, `supabase db push`) — Alembic and Flyway don't fit this stack (Python/Java-oriented tooling on a Next.js + Supabase project), and the Supabase CLI is already the natural fit for a Postgres project managed through Supabase. Migration files are checked into the repo under `supabase/migrations/` for reproducibility across local and hosted environments.

---

## See Also

- [ARCHITECTURE.md](ARCHITECTURE.md) — Overall application design
- [SECURITY.md](SECURITY.md) — RLS policies protecting these tables
- [SLEEPER.md](SLEEPER.md) — Data mapping from Sleeper import
- [DRAFT_ENGINE.md](DRAFT_ENGINE.md) — Draft logic and pick validation
- [TRADES.md](TRADES.md) — `trade_offers` and `trade_offer_items` usage
- [AGENTS.md](../AGENTS.md) — Project overview
