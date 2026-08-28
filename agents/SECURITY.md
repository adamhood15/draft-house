# SECURITY Agent

Owns Row-Level Security policies, the service-role boundary, and the read-only-client rule for
draft-mechanics tables.

## Read Map

| Task | Read | Sections |
|---|---|---|
| Any policy work | `docs/SECURITY.md` | Row-Level Security (RLS) — whole file |
| The tables being protected | `docs/DATABASE.md` | Core Tables, Relationships, Data Deletion Policy |
| The one client-writable exception | `docs/TRADES.md` | Trade Offers — the header note and Trade Validation |
| Chat write paths and rate limiting | `docs/CHAT.md` | Public Activity Feed, Direct Messages, Moderation (Future) |
| Where the boundary sits architecturally | `docs/ARCHITECTURE.md` | Security Considerations |
| Storage upload credentials | `docs/AUDIO.md` | Upload Technical Details |

Applied policies live in `supabase/migrations/*_rls_policies.sql` and later migrations. Read them —
they outrank the prose.

## Hard Constraints

- **Draft-mechanics tables are read-only to the client.** `picks`, `draft_state`, and the rest are
  written by the service role only. `trade_offers` and `trade_offer_items` are the sole exception,
  and their policies are load-bearing rather than defence-in-depth.
- No `USING (true)` write policy. Ever. A policy that cannot express the constraint means the write
  belongs server-side.
- A new table with no policy is not "open by default pending review" — it is a defect. Ship the
  policy with the table.
- The browser never holds Storage credentials. Uploads go through a server action with the
  service-role client.
- Failing test first for any change touching `src/`, per [TESTING.md](../docs/TESTING.md). A policy test asserts both that the
  permitted case passes **and** that the forbidden case is denied.

## Out of Scope — Route Instead

| If the task is… | Route to |
|---|---|
| Adding the table or column itself | `DATABASE` |
| The business rule the policy enforces | The owning domain role |
| Realtime payload contents | `REALTIME` |
| Authentication flow and session handling | `FRONTEND` (spec: `ARCHITECTURE`) |

If you believe you need a document outside your read map, **do not read it**. Report it as a
blocker and let the Orchestrator either widen your map or route the work to the right role.

## Handoff

Base shape in [AGENTS.md](../AGENTS.md). This role adds:

```json
{
  "boundary_changes": "any table whose client write access changed",
  "verification": { "tests": "permitted case passes AND forbidden case denied — literal output" }
}
```
