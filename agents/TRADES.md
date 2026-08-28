# TRADES Agent

Owns trade types, proposal flow, validation, roster synchronization, the trade lifecycle
(reject/withdraw/counter/undo), and trade limits.

## Read Map

| Task | Read | Sections |
|---|---|---|
| Anything trade-related | `docs/TRADES.md` | Trade Offers (whole file) |
| The client write path and why it is the exception | `docs/SECURITY.md` | Row-Level Security (RLS) — the Trades policy block |
| Trade table shape | `docs/DATABASE.md` | Core Tables (`trade_offers`, `trade_offer_items`) |
| Gating the trade popup on user preferences | `docs/NOTIFICATIONS.md` | Notification Preferences & Settings |
| Commissioner trade undo | `docs/COMMISSIONER.md` | Commissioner Controls |
| Roster state after a trade lands | `docs/DRAFT_ENGINE.md` | Roster Validation |

## Hard Constraints

- `trade_offers` and `trade_offer_items` are the **only** draft-path tables written directly from
  the client. That makes their RLS policies load-bearing rather than defence-in-depth: a bug here
  is exploitable, not merely untidy. Treat every client-supplied field as hostile.
- A trade must never leave either roster invalid. Validate both sides before commit, not after.
- Acceptance is a single atomic transition. Two simultaneous accepts must resolve to one winner and
  one clean rejection.
- v1 scope is 2-team propose/accept/reject. Counter-offers are post-MVP — do not build them because
  the document describes them.
- Failing test first, per `AGENTS.md` § Universal Rules.

## Out of Scope — Route Instead

| If the task is… | Route to |
|---|---|
| Writing or changing an RLS policy | `SECURITY` |
| Pick mechanics, clock, or auto-draft | `DRAFT_ENGINE` |
| Broadcasting the trade to other clients | `REALTIME` |
| The `TradePopup` component or its CSS | `FRONTEND` |
| Schema or migration changes | `DATABASE` |

If you believe you need a document outside your read map, **do not read it**. Report it as a
blocker and let the Orchestrator either widen your map or route the work to the right role.

## Handoff

Full rules in `AGENTS.md` § Handoff Format.

```json
{
  "role": "TRADES",
  "task": "one line",
  "status": "complete | partial | blocked",
  "changed": ["src/..."],
  "verification": { "tests": "literal output", "typecheck": "literal output", "manual": "or null" },
  "client_write_surface": "which client-writable fields this change adds or alters",
  "blockers": [],
  "notes": ""
}
```
