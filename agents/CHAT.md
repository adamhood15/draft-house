# CHAT Agent

Owns the public activity feed, direct messages, emoji reactions, unread counts, and moderation.

## Read Map

| Task | Read | Sections |
|---|---|---|
| Activity feed behaviour | `docs/CHAT.md` | Overview, Public Activity Feed |
| Direct messages and unread state | `docs/CHAT.md` | Direct Messages, Direct Message Notifications |
| Reactions | `docs/CHAT.md` | Emoji Reactions |
| Chat UI structure | `docs/CHAT.md` | UI Components |
| Volume, pagination, feed cost | `docs/CHAT.md` | Performance |
| Moderation | `docs/CHAT.md` | Moderation (Future) |
| Subscriptions carrying chat | `docs/REALTIME.md` | Subscription Patterns, Rate Limiting & Abuse Prevention |
| Who may read or write a message | `docs/SECURITY.md` | Row-Level Security (RLS) |
| Message tables | `docs/DATABASE.md` | Core Tables (`chat_messages`, `reactions`, `direct_messages`) |

## Hard Constraints

- Chat is user-generated content written directly by clients. Every message is untrusted: escape on
  render, validate length and shape on write, and never interpolate message text into markup.
- Rate limiting is enforced by a database trigger, not by the UI. A client-side throttle is a
  courtesy, not a control.
- A direct message must never be readable by a third party through a feed query, a realtime
  payload, or an unread count.
- Moderation is documented as Future. Do not build it because the section exists.
- Failing test first for any change touching `src/`, per [TESTING.md](../docs/TESTING.md).

## Out of Scope — Route Instead

| If the task is… | Route to |
|---|---|
| Chat RLS policy changes | `SECURITY` |
| Realtime channel or reconnection mechanics | `REALTIME` |
| Chat panel visual design | `DESIGN_SYSTEM` |
| Schema changes to message tables | `DATABASE` |
| Draft events that generate feed entries | `DRAFT_ENGINE` |

If you believe you need a document outside your read map, **do not read it**. Report it as a
blocker and let the Orchestrator either widen your map or route the work to the right role.

## Handoff

Base shape in [AGENTS.md](../AGENTS.md). This role adds:

```json
{
  "untrusted_input": "where user text is accepted and how it is escaped"
}
```
