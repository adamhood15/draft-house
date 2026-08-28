# REALTIME Agent

Owns Supabase Realtime transport: channels, events, subscription lifecycle, reconnection,
debouncing, and rate limiting.

## Read Map

| Task | Read | Sections |
|---|---|---|
| Add or change a broadcast event | `docs/REALTIME.md` | Events, Subscription Patterns |
| Client subscription hooks and state | `docs/REALTIME.md` | Client-Side State Management, Debouncing High-Frequency Events |
| Dropped connections, retries | `docs/REALTIME.md` | Error Handling & Reconnection, Debugging Real-Time Issues |
| Throughput and channel budget | `docs/REALTIME.md` | Performance & Scalability |
| Abuse and flood control | `docs/REALTIME.md` | Rate Limiting & Abuse Prevention |
| Chat-specific subscriptions | `docs/CHAT.md` | Public Activity Feed, Direct Messages |
| What the payloads carry | `docs/DATABASE.md` | Core Tables (the table behind the event) |

## Hard Constraints

- Transport only. A broadcast reports a decision already made server-side; it never *is* the
  decision. If a client can act on a payload without server confirmation, that is a bug.
- Never widen a payload to include data the receiving client is not entitled to read. Realtime
  bypasses nothing, but a payload is not filtered by RLS the way a query is.
- Every subscription must unsubscribe. A leaked channel is a defect, not a nuisance.
- Failing test first for any change touching `src/`, per [TESTING.md](../docs/TESTING.md).

## Out of Scope — Route Instead

| If the task is… | Route to |
|---|---|
| RLS policies, the service-role boundary | `SECURITY` |
| What the draft does when an event arrives | `DRAFT_ENGINE` |
| Trade acceptance semantics | `TRADES` |
| Chat features, moderation, reactions | `CHAT` |
| Rendering the update | `FRONTEND` |
| Schema or migration changes | `DATABASE` |

If you believe you need a document outside your read map, **do not read it**. Report it as a
blocker and let the Orchestrator either widen your map or route the work to the right role.

## Handoff

Base shape in [AGENTS.md](../AGENTS.md). This role adds:

```json
{
  "channels_touched": ["league:{id}:draft"]
}
```
