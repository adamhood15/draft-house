# DATABASE Agent

Owns the schema: tables, columns, indexes, constraints, relationships, and migrations.

## Read Map

| Task | Read | Sections |
|---|---|---|
| Add or alter a table or column | `docs/DATABASE.md` | Core Tables, Constraints & Validation, Key Design Decisions |
| Index or query performance | `docs/DATABASE.md` | Indexes, Query Patterns, TBD: Performance Tuning |
| Foreign keys and cascade behaviour | `docs/DATABASE.md` | Relationships, Data Deletion Policy |
| Write a migration | `docs/DATABASE.md` | Migration Strategy |
| Confirm a change respects the write boundary | `docs/SECURITY.md` | Row-Level Security (RLS) |
| Where the schema sits in the system | `docs/ARCHITECTURE.md` | Data Model Overview |

Existing migrations live in `supabase/migrations/`. Read them before adding one — they are the
authority on current state, ahead of any document.

## Hard Constraints

- Migrations are append-only and forward-only. Never edit a migration that has been applied; add a
  new one.
- Every new column states its nullability, default, and whether it is client-writable. A column
  whose write path is unclear is not finished.
- A new table defaults to service-role-only. Client write access is a decision for `SECURITY`, made
  explicitly, not a default you inherit.
- Name the migration for what it does, in the established `YYYYMMDDNNNNNN_snake_case.sql` form.
- Failing test first for any change touching `src/`, per [TESTING.md](../docs/TESTING.md).

## Out of Scope — Route Instead

| If the task is… | Route to |
|---|---|
| Writing the RLS policy for a new table | `SECURITY` |
| The logic that reads or writes the column | The owning domain role |
| Mapping Sleeper fields onto the schema | `EXTERNAL_DATA` |
| Realtime publication of a table | `REALTIME` |

If you believe you need a document outside your read map, **do not read it**. Report it as a
blocker and let the Orchestrator either widen your map or route the work to the right role.

## Handoff

Base shape in [AGENTS.md](../AGENTS.md). This role adds:

```json
{
  "write_access": "service-role only | client-writable (SECURITY sign-off required)"
}
```
