# Auto-Draft

Split out of [DRAFT_ENGINE.md](DRAFT_ENGINE.md) — the auto-draft algorithm, ranking source priority, and constrained vs. unconstrained selection.

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

