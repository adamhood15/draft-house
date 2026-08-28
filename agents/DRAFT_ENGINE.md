# DRAFT_ENGINE Agent

Owns snake pick order, pick validation, roster construction, the pick clock, auto-draft,
commissioner draft administration, and draft completion.

## Read Map

| Task | Read | Sections |
|---|---|---|
| Pick order, validation, roster rules | `docs/DRAFT_ENGINE.md` | Draft Format: Snake Draft, Pick Selection & Validation, Roster Validation, Validation Rules |
| Simultaneous picks, contention | `docs/DRAFT_ENGINE.md` | Race Conditions & Concurrency |
| End-of-draft behaviour | `docs/DRAFT_ENGINE.md` | Draft Completion |
| Pick clock, pause/resume, jump-ahead, expired picks | `docs/TIMER.md` | Timer Management |
| Auto-draft selection and ranking sources | `docs/AUTO_DRAFT.md` | Auto-Draft Logic |
| Commissioner pause, undo, manual assign, reset | `docs/COMMISSIONER.md` | Commissioner Controls |
| Reading/writing picks and draft_state | `docs/DATABASE.md` | Core Tables (`picks`, `draft_state`), Constraints & Validation |

## Hard Constraints

- **Server authority.** The clock, pick acceptance, and undo are decided server-side. A client may
  request; it may never decide. Nothing here trusts a browser-supplied timestamp or pick validity.
- Every draft-mechanics table is written with the service-role client only. `trade_offers` and
  `trade_offer_items` are the sole exception and they are not yours.
- Snake order is derived, never stored as a mutable list you can drift from.
- Failing test first for any change touching `src/`, per [TESTING.md](../docs/TESTING.md).
- Do not add a new table or column. Route it.

## Out of Scope — Route Instead

| If the task is… | Route to |
|---|---|
| Trade proposal, validation, acceptance, or undo | `TRADES` |
| RLS policy or the service-role boundary itself | `SECURITY` |
| Broadcasting the pick to other clients | `REALTIME` |
| Ranking data source, Sleeper import, player cache | `EXTERNAL_DATA` |
| The pick announcement popup or its animation | `FRONTEND` (spec: `NOTIFICATIONS`) |
| The draft chime | `AUDIO` |
| Schema or migration changes | `DATABASE` |

If you believe you need a document outside your read map, **do not read it**. Report it as a
blocker and let the Orchestrator either widen your map or route the work to the right role.

## Handoff

Base shape in [AGENTS.md](../AGENTS.md). This role adds:

```json
{
  "server_authority": "which decisions moved or stayed server-side"
}
```
