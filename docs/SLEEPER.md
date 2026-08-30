# Sleeper Integration

This document describes how Draft House integrates with the Sleeper fantasy football API.

## Overview

Sleeper is used as a **one-time initialization source** for Draft House leagues.

The commissioner imports a Sleeper league, which retrieves configuration (league settings, roster construction, team info, draft order). After import, Draft House maintains its own state independently. Sleeper data is referenced only for:

- Player lookups (if needed)
- Rankings (for auto-draft)
- Initial configuration

**Important**: Draft House does not continuously sync to Sleeper. Changes in Draft House are not reflected back to Sleeper.

---

## Sleeper API Overview

### Base URL
```
https://api.sleeper.app/v1
```

### Endpoints Used

#### 1. Get League

```
GET /league/{league_id}
```

**Response**:
```json
{
  "league_id": "1234567890",
  "name": "Hood Family Fantasy",
  "season": 2025,
  "league_size": 12,
  "status": "in_season",
  "settings": {
    "bench_slots": 6,
    "reserve_slots": 0,
    "taxi_slots": 0,
    "positions": ["QB", "RB", "WR", "TE", "FLEX", "DEF", "K"],
    "...": "..."
  },
  "rosters": [...]
}
```

---

#### 2. Get Rosters

```
GET /league/{league_id}/rosters
```

**Response**:
```json
[
  {
    "roster_id": 1,
    "owner_id": "user_123",
    "players": ["2222", "3333", ...],
    "starters": ["2222", "3333"],
    "settings": {"...": "..."}
  },
  ...
]
```

---

#### 3. Get League Users

```
GET /league/{league_id}/users
```

**Response**:
```json
[
  {
    "user_id": "user_123",
    "username": "adamhood",
    "display_name": "Adam Hood",
    "avatar": "https://...",
    "...": "..."
  },
  ...
]
```

---

#### 4. Get Draft

```
GET /draft/{draft_id}
```

Fetch the draft **by id**, taken from `league.draft_id`. `GET /league/{league_id}/drafts` also exists
and returns the same shape, but it is an array spanning prior seasons with no documented ordering, so
taking `[0]` can silently source the clock, rounds, order type *and* every seat from a draft that
isn't happening. It also omits `slot_to_roster_id`.

**Response** (verified against league `1357756813482684416`):
```json
{
  "draft_id": "draft_123",
  "league_id": "league_456",
  "type": "snake",
  "status": "pre_draft",
  "sport": "nfl",
  "season": "2026",
  "season_type": "regular",
  "start_time": 1788110110440,
  "settings": {
    "teams": 12,
    "rounds": 16,
    "pick_timer": 30,
    "slots_qb": 1,
    "slots_rb": 2,
    "...": "..."
  },
  "metadata": { "scoring_type": "ppr", "name": "Draft", "description": "" },
  "draft_order": { "<user_id>": 1, "<user_id>": 2, "...": 12 },
  "slot_to_roster_id": { "1": 7, "2": 3, "...": 12 },
  "last_picked": 1515700871182
}
```

> **The pick clock is `settings.pick_timer`.** There is no `seconds_per_pick` field on any Sleeper
> payload. This document used to show one in the example above, and both the import and the seed
> script dutifully read it — so every imported league drafted on the 60-second fallback no matter
> what its commissioner had configured. Nothing failed, because 60 is a perfectly plausible answer.
>
> `pick_timer: 0` means **unlimited**, not missing. Treating it as absent restores the default on
> exactly the leagues that deliberately turned the clock off.

---

#### 5. Get Players

```
GET /players/nfl
```

A map of `player_id` → player object. **~14.6 MB parsed** (about 5 MB gzipped over the wire), so it
is fetched at most once per day in the background and cached in [`players`](DATABASE.md#16-players).

**Response**:
```json
{
  "2222": {
    "player_id": "2222",
    "first_name": "Bijan",
    "last_name": "Robinson",
    "full_name": "Bijan Robinson",
    "position": "RB",
    "fantasy_positions": ["RB"],
    "team": "ATL",
    "status": "Active",
    "active": true,
    "search_rank": 12,
    "...": "..."
  },
  ...
}
```

Verified against the live endpoint on 2026-08-30: **12,225 players, 53 keys, every key present on
every player** — Sleeper sends nulls rather than omitting fields.

> **Two fields this document used to claim, which do not exist.**
>
> - The NFL team is **`team`**, not `nfl_team`.
> - **There is no `bye_week`.** Confirmed absent across all 12,225 players. Bye weeks are derived
>   from the NFL schedule instead and stored in [`team_bye_weeks`](DATABASE.md#17-team_bye_weeks) —
>   see `src/lib/espn/bye-weeks.ts`.
>
> `search_rank` is Sleeper's own search ordering (`9999999` = unranked). It is **not** a fantasy
> ranking; those come from [`player_values`](DATABASE.md#18-player_values).

---

#### 6. Get Trending Players

```
GET /players/nfl/trending/add?limit=25
```

**Response**:
```json
[
  {
    "player_id": "2222",
    "count": 156,  // times added in last 24h
    "...": "..."
  },
  ...
]
```

---

## Import Flow

### Step 1: Commissioner Enters League ID

```
Commissioner provides Sleeper league ID
    ↓
Validate ID format
    ↓
Call Sleeper API: GET /league/{league_id}
```

### Step 2: Retrieve League Data

```
GET /league/{league_id}
    ↓ (retrieve)
GET /league/{league_id}/rosters
GET /league/{league_id}/users
GET /draft/{league.draft_id}          ← by id, not /league/{id}/drafts
```

### Step 3: Transform & Store

Raw Sleeper data → Draft House database

See "Data Mapping" below for transformation rules.

### Step 4: Commissioner Review

Commissioner sees league settings and can edit before confirming:

```
League Name: Hood Family Fantasy
Season: 2025
League Size: 12
Scoring: PPR (from Sleeper settings)
Roster Construction: QB 1, RB 2, WR 2, TE 1, FLEX 1, DEF 1, BENCH 6

[ Edit Settings ] [ Confirm ]
```

### Step 5: Draft Settings Review

Commissioner reviews and can edit draft configuration:

```
Draft Order: Snake                      ← from draft.type
Seconds per Pick: 30                   ← from draft.settings.pick_timer (0 = unlimited)
Draft Start Time: (from draft.start_time)
Allow Pick Trading: enabled            ← Draft House only, no Sleeper equivalent
Auto-Draft: Disabled / Enabled         ← can toggle

[ Edit Settings ] [ Confirm ]
```

### Step 6: Confirm & Activate

League is now active in Draft House.

---

## Multi-Season Leagues

Draft House doesn't need a dedicated "re-draft next season" feature: Sleeper issues a new `league_id` every season, even for a returning league (chained via Sleeper's own `previous_league_id` field on their end). So when the same family league comes back next year, the commissioner just imports that new Sleeper league ID, which naturally creates a new, independent `leagues` row here — last year's draft, chat, and rosters stay untouched. A "league" in Draft House is inherently single-season.

---

## Data Mapping

### League Settings

| Sleeper Field | Draft House Field | Notes |
|---|---|---|
| `league_id` | `sleeper_league_id` | Stored for reference |
| `name` | `name` | Editable |
| `season` | `season` | Read-only |
| `league_size` | `league_size` | Read-only |
| `settings.positions` | `positions` (JSONB) | Roster construction |
| `status` | — | Used for validation only |
| All settings | `league_settings` (JSONB) | Backup copy |

**Example positions mapping**:

```
Sleeper: ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "DEF", "K", "BN", "BN", "BN"]

Draft House:
{
  "QB": 1,
  "RB": 2,
  "WR": 2,
  "TE": 1,
  "FLEX": 1,
  "DEF": 1,
  "K": 1,
  "BN": 3
}
```

---

### Teams

| Sleeper Field | Draft House Field | Notes |
|---|---|---|
| `owner_id` | `sleeper_user_id` | Store Sleeper user ID |
| `owner_id` → lookup username | — | Potential fallback for missing owner |
| — | `draft_position` | **Never** the roster position. The seat comes from the draft's `slot_to_roster_id`, or `draft_order` as a fallback — see [Draft Settings](#draft-settings). Reading it off `roster_id` produced a complete, plausible, wrong board every time |
| `roster_id` | `sleeper_roster_id` | What `drafts.slot_to_roster_id` points at; without it that map cannot be resolved back to a team |
| `users[].metadata.team_name` | `sleeper_team_name`, `draft_house_team_name` | On the league **USER**, not the roster — `/rosters` carries notification preferences and no name at all. Falls back through `roster.metadata.team_name` → `display_name` → `Team {n}`. The two columns start equal; the `draft_house_` one is the editable copy |
| `users[].metadata.avatar` | `team_image_url` | A full URL when the manager uploaded a team avatar; otherwise the account `avatar` id expanded against the CDN. Validated as https at the boundary, since it lands in an `<img src>`. `custom_image_url` is the in-app override and is never written by import |

**Example team transformation**:

```
Sleeper Roster:
  roster_id: 1
  owner_id: "user_123"
  avatar: "https://..."

Draft House Team:
  sleeper_user_id: "user_123"
  owner_id: null (until they claim in Draft House)
  sleeper_team_name: "The Hoodlums"
  team_image_url: "https://..."
  draft_position: 1
  draft_house_team_name: "The Hoodlums"  (copy initially)
  is_auto_draft: false (commissioner sets)
```

---

### Players & Picks

Sleeper player IDs are used to reference NFL players:

| Sleeper Field | Draft House Field | Source |
|---|---|---|
| `player_id` | `sleeper_player_id` | From rosters or pick history |
| `full_name` (or `first_name` + `last_name`) | `player_name` | From `players` |
| `position` | `player_position` | From `players` |
| `team` | `player_nfl_team` | From `players`. The field is `team` — there is no `nfl_team` on Sleeper |
| — | — | **No bye week.** Sleeper does not send one; it is derived from the NFL schedule into [`team_bye_weeks`](DATABASE.md#17-team_bye_weeks) and joined on `team`. `draft_picks` has no `player_bye` column as a result |

---

### Player Photos

Player headshots are never fetched from an API or stored in the database. They're built at render time as static URLs from Sleeper's public CDN, keyed by `sleeper_player_id`:

**Individual players**:
```
https://sleepercdn.com/content/nfl/players/thumb/{sleeperPlayerId}.jpg
```

**Team defenses**: Sleeper models a DEF as a "player" whose ID is the team abbreviation (e.g. `"KC"`) with no individual headshot. Use the team logo instead:
```
https://sleepercdn.com/images/team_logos/nfl/{team}.png
```

No authentication or rate limiting applies — these are plain static image requests. See [DATABASE.md](DATABASE.md#5-draft_picks) and [NOTIFICATIONS.md](NOTIFICATIONS.md#pick-announcement--animation-sequence) for where these are used.

---

### Draft Settings

Everything below lands on [`drafts`](DATABASE.md#3-drafts), the one row per league that holds both the
draft's configuration and its live clock.

| Sleeper Field | Draft House Field | Notes |
|---|---|---|
| `slot_to_roster_id` | `drafts.slot_to_roster_id`, `teams.draft_position` | Map of slot → **Sleeper `roster_id`**. The authoritative seating, and only `GET /draft/{id}` returns it. Resolved against `teams.sleeper_roster_id` |
| `draft_order` | `drafts.draft_order`, `teams.draft_position` | Map of `user_id` → slot, **not** `roster_id`. The fallback when `slot_to_roster_id` is absent. Both are applied by `assignDraftPositions` (`src/lib/sleeper/draft-order.ts`); null until the Sleeper commissioner sets the order, which falls back to `roster_id` order |
| `settings.pick_timer` | `drafts.pick_timer` | Seconds per pick; `0` = unlimited. Editable |
| `settings.rounds` | `drafts.rounds` | The board's length. **Not** `roster_positions.length` — a rookie draft has fewer rounds than roster slots, and the draft is authoritative about its own board. Falls back to roster slots only when absent |
| `type` | `drafts.type` | `snake` and `linear` map through; `auction` falls back to `snake` with a warning, since Draft House has no board shape for it |
| `status` | `drafts.status` | Sleeper's `pre_draft` maps to `setup`, the first of Draft House's two pre-draft stages |
| `start_time` | `drafts.start_time` | Epoch **milliseconds** on Sleeper, `timestamptz` here |
| `settings` (whole) | `drafts.settings` | Kept verbatim as provenance. Never read back — the promoted columns above are authoritative |
| `metadata` (whole) | `drafts.metadata` | Same. Note `metadata.scoring_type` is a compound league-shape label (`idp_1qb`, `dynasty_ppr`), **not** a scoring format — see [Scoring Format](#scoring-format) |
| `settings.teams` | — | Deliberately ignored. Sleeper derives it from the league, so it agrees with `/rosters` by construction; `leagues.league_size` comes from the roster count, which is what `startDraft` validates seats against |

---

## Empty/Unowned Teams

**Problem**: If a Sleeper team has no owner, what does Draft House do?

**Solution**: Commissioner chooses:

### Option 1: Manual Commissioner Control

```
SELECT t.* FROM teams WHERE sleeper_user_id IS NULL AND league_id = ?;

Draft House shows:
  "Unclaimed Team 8 — Commissioner Control"
  
When pick #X arrives for this team:
  Commissioner picks player manually
```

### Option 2: Auto-Draft

```
UPDATE teams SET is_auto_draft = true WHERE id = ?;

When pick #X arrives:
  System selects next available player from rankings
```

**Ranking source**: See [Player Rankings for Auto-Draft](#player-rankings-for-auto-draft) below — Fantasy Football Calculator ADP by default, optionally FantasyPros Premium if the commissioner supplies a key.

---

## Player Rankings for Auto-Draft

When a team is set to auto-draft, the system needs a ranking to select players automatically. Sleeper doesn't expose one (`/players/nfl/trending/add` is 24h add-activity, not a ranked list), so Draft House sources it externally.

### Default (Free): Fantasy Football Calculator ADP

**Base URL**: `https://fantasyfootballcalculator.com/api/v1/adp/{scoring}`

- `{scoring}` is one of `standard`, `ppr`, `half-ppr` — mapped from `leagues.scoring_format` (`std`→`standard`, `ppr`→`ppr`, `half_ppr`→`half-ppr`)
- Query params: `teams` (from `leagues.league_size`), `year` (from `leagues.season`)
- No API key, no auth. Free for personal and commercial use. No published hard rate limit — data only refreshes once per day upstream, so Draft House fetches it **once at draft load**, not per-pick (same moment the Sleeper player cache is built — see [DRAFT_ENGINE.md](DRAFT_ENGINE.md#draft-load-validation))
- Attribution to Fantasy Football Calculator should be included wherever ADP-derived rankings are shown

**Example**: `GET https://fantasyfootballcalculator.com/api/v1/adp/ppr?teams=12&year=2026`

**Response shape**:
```json
{
  "status": "...",
  "meta": { "type": "ppr", "teams": 12, "rounds": 15, "total_drafts": 7479, "start_date": "...", "end_date": "..." },
  "players": [
    {
      "player_id": 12345,
      "name": "Bijan Robinson",
      "position": "RB",
      "team": "ATL",
      "adp": 4.2,
      "adp_formatted": "1.04",
      "times_drafted": 7201,
      "high": 1,
      "low": 14,
      "stdev": 2.1,
      "bye": 5
    }
  ]
}
```

**Cross-referencing to Sleeper players**: FFC's `player_id` is FFC's own identifier, not `sleeper_player_id` — there's no shared key. At draft load, match each FFC entry to a Sleeper player by `name` + `position` + `team` (normalize suffixes like Jr./Sr./II/III, and handle DEF entries by team abbreviation) and cache the resulting `sleeper_player_id → adp_rank` map alongside the player cache. Unmatched players (rare — mostly deep-bench/practice-squad guys) fall back to the end of the ranking.

### Optional (Paid): FantasyPros Premium Consensus Rankings

FantasyPros has a real consensus-rankings API (`GET /public/v2/json/nfl/{season}/consensus-rankings`), but its free tier is explicitly non-production sample data — real rankings require a Premium key (~$8.99/mo, bundled with a FantasyPros HOF subscription, personal non-commercial license). This isn't the default, but the commissioner can optionally supply a FantasyPros API key in league settings to use it instead of FFC ADP — see [AUTO_DRAFT.md](AUTO_DRAFT.md#ranking-source-priority) for how the two sources are prioritized.

---

## Caching & Performance

### Cache Strategy

- **League data**: Cache for duration of draft (doesn't change)
- **Player data**: Cache indefinitely (static)
- **Draft order**: Cache after import (immutable in Draft House)

### Considerations

- Sleeper API rate limits (TBD: contact Sleeper for limits)
- Database queries are cheaper than API calls
- Import only happens once per league

---

## Error Handling

### Invalid League ID

```
Commissioner enters: "abc123"
    ↓
Sleeper API returns 404
    ↓
"League not found. Please check the league ID."
```

### Network Timeout

```
Sleeper API unreachable
    ↓
Retry up to 3 times with exponential backoff
    ↓
Show: "Unable to import league. Please try again."
```

### Incomplete Data

```
League missing roster positions
    ↓
Warn commissioner: "This league has unusual settings. Some features may not work correctly."
    ↓
Allow manual override
```

### Unsupported Scoring Settings

```
Sleeper league uses "dynasty" or "best ball"
    ↓
Draft House is designed for redraft only
    ↓
Warn: "This league type may not be fully supported."
    ↓
Proceed anyway (commissioner decision)
```

---

## API Secrets & Authentication

**Current State**: Sleeper API is public (no authentication required)

**TBD**:
- Does Sleeper limit unauthenticated requests?
- Should we implement rate limiting on our end?
- Any future authentication requirements?

**Environment variables**:
```
SLEEPER_API_BASE_URL = "https://api.sleeper.app/v1"
SLEEPER_API_TIMEOUT = 10000  # milliseconds
```

---

## Testing & Validation

### Test Leagues

When developing, use known Sleeper league IDs:
- (TBD: Test league ID 1 — standard 12-team PPR)
- (TBD: Test league ID 2 — unusual roster construction)
- (TBD: Test league ID 3 — no owners in some teams)

### Data Validation

After import, validate:
- All teams present
- All players retrievable
- All draft order positions filled
- Roster construction matches league size

---

## Future Enhancements

### Real-Time Sleeper Sync (Post-MVP)

- Periodically check if league composition changed
- Warn commissioner if teams were added/removed
- Auto-update player injury status or bye weeks

### Sleeper Stats Integration

- Display player stats in Draft House
- Use Sleeper as source for historical data

### Two-Way Sync (Speculative)

- Sync Draft House picks back to Sleeper (if Sleeper adds draft import feature)
- Current plan: one-way import only

---

## Troubleshooting

### "League not found"
- Verify league ID is correct
- Check if league is on Sleeper (not a different platform)

### "Import stalled"
- Check network connectivity
- Try again; Sleeper API may be slow
- Contact support if persistent

### "Unusual roster construction"
- Some leagues have custom positions
- Commissioner can manually adjust in Draft House

---

## See Also

- [DATABASE.md](DATABASE.md) — Data schema for imported league
- [DRAFT_ENGINE.md](DRAFT_ENGINE.md) — Using imported data for draft
- [ARCHITECTURE.md](ARCHITECTURE.md) — Integration architecture
- [AGENTS.md](../AGENTS.md) — Project overview
