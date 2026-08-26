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
GET /league/{league_id}/drafts
```

**Response**:
```json
[
  {
    "draft_id": "draft_123",
    "league_id": "league_456",
    "season": 2025,
    "draft_order": [1, 2, 3, ..., 12],
    "type": "snake",
    "settings": {
      "rounds": 16,
      "slots_taken": 12,
      "seconds_per_pick": 60
    },
    "...": "..."
  }
]
```

---

#### 5. Get Players

```
GET /players/nfl
```

**Response**:
```json
{
  "2222": {
    "player_id": "2222",
    "first_name": "Bijan",
    "last_name": "Robinson",
    "position": "RB",
    "nfl_team": "ATL",
    "bye_week": 10,
    "status": "Active",
    "...": "..."
  },
  ...
}
```

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
GET /league/{league_id}/drafts
GET /players/nfl (for player name/position/team lookups)
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
Draft Format: Snake
Seconds per Pick: 60
Allow Pick Trading: (from Sleeper) ← can edit
Draft Order: (from Sleeper draft) ← can edit
Auto-Draft: Disabled / Enabled ← can toggle

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
| `roster_id` | — | Used as internal reference |
| `owner_id` | `sleeper_user_id` | Store Sleeper user ID |
| `owner_id` → lookup username | — | Potential fallback for missing owner |
| Roster position | `draft_position` | 1-12 for 12-team league |
| Display name | `sleeper_team_name` | Preserved; not modified |
| Team avatar | `team_image_url` | Original from Sleeper |

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
| `first_name` + `last_name` | `player_name` | From `/players/nfl` |
| `position` | `player_position` | From `/players/nfl` |
| `nfl_team` | `player_nfl_team` | From `/players/nfl` |
| `bye_week` | `player_bye` | From `/players/nfl` |

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

No authentication or rate limiting applies — these are plain static image requests. See [DATABASE.md](DATABASE.md#6-picks) and [DRAFT_ENGINE.md](DRAFT_ENGINE.md#pick-announcement--animation-sequence) for where these are used.

---

### Draft Settings

| Sleeper Field | Draft House Field | Notes |
|---|---|---|
| `draft_order` | — | Used to sort teams |
| `settings.seconds_per_pick` | `seconds_per_pick` | Editable |
| `type` | `draft_format` | Snake, other formats TBD |
| `settings.rounds` | — | Calculated from roster size |

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

FantasyPros has a real consensus-rankings API (`GET /public/v2/json/nfl/{season}/consensus-rankings`), but its free tier is explicitly non-production sample data — real rankings require a Premium key (~$8.99/mo, bundled with a FantasyPros HOF subscription, personal non-commercial license). This isn't the default, but the commissioner can optionally supply a FantasyPros API key in league settings to use it instead of FFC ADP — see [DRAFT_ENGINE.md](DRAFT_ENGINE.md#ranking-source-priority) for how the two sources are prioritized.

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
- [ARCHITECTURE.md](../ARCHITECTURE.md) — Integration architecture
- [AGENTS.md](../AGENTS.md) — Project overview
