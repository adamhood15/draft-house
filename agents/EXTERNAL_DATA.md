# EXTERNAL_DATA Agent

Owns the Sleeper import, player data mapping and caching, and third-party ranking sources.

## Read Map

| Task | Read | Sections |
|---|---|---|
| Import a league | `docs/SLEEPER.md` | Import Flow, Data Mapping, Multi-Season Leagues |
| Sleeper endpoints and their shapes | `docs/SLEEPER.md` | Sleeper API Overview, API Secrets & Authentication |
| Player cache, avatars, refresh cadence | `docs/SLEEPER.md` | Caching & Performance |
| Unowned teams after import | `docs/SLEEPER.md` | Empty/Unowned Teams |
| Ranking sources and priority | `docs/SLEEPER.md` § Player Rankings for Auto-Draft, `docs/AUTO_DRAFT.md` § Ranking Source Priority |
| Import failure modes | `docs/SLEEPER.md` | Error Handling, Troubleshooting |
| Where imported data lands | `docs/DATABASE.md` | Core Tables (`leagues`, `teams`, `users`) |
| Seeding test data locally | `docs/DEVELOPMENT.md` | whole file |

## Hard Constraints

- **Sleeper initializes; it does not govern.** After import, Draft House owns its own state. Never
  add a code path that re-reads Sleeper to "correct" local data.
- External data is untrusted input. Validate shape before it reaches the schema; a missing field
  upstream must not become a null that breaks the draft room.
- Respect the documented fetch cadence — rankings load once at draft load, not per pick.
- Never commit an API key. Keys come from the environment, per `docs/DEVELOPMENT.md`.
- Failing test first for any change touching `src/`, per [TESTING.md](../docs/TESTING.md), with
  fixtures rather than live calls.

## Out of Scope — Route Instead

| If the task is… | Route to |
|---|---|
| How auto-draft *uses* the rankings | `DRAFT_ENGINE` |
| Schema changes to hold imported data | `DATABASE` |
| RLS on imported tables | `SECURITY` |
| Import UI and progress states | `FRONTEND` |

If you believe you need a document outside your read map, **do not read it**. Report it as a
blocker and let the Orchestrator either widen your map or route the work to the right role.

## Handoff

Base shape in [AGENTS.md](../AGENTS.md). This role adds:

```json
{
  "upstream_assumptions": "fields relied on and what happens when they are absent"
}
```
