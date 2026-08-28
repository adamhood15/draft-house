# AGENTS.md

Draft House is a private, real-time fantasy football draft experience: import a Sleeper league,
customize the draft, invite friends by link, and host a live draft with walk-up music, chat, and
reactions.

```bash
npm test              # vitest
npm run typecheck     # tsc --noEmit
npm run lint          # eslint
npm run build         # production build
```

## How agents work here

Work here is done by role-scoped agents. Each role has a **read map** naming the exact documents
and sections its tasks need, so an agent loads context for the job rather than the whole
documentation set.

Every session:

1. **Identify your role.** If you were not given one, you are the Orchestrator — route the work, do
   not do it.
2. **Open `agents/<ROLE>.md`.** Read its Read Map, Hard Constraints, and Out of Scope table before
   anything else. The read-map rule that binds you is stated there.
3. **Read only what your map names for the task at hand** — the named sections, not whole files,
   unless the map says "whole file".
4. **Do the work**, following [docs/ENGINEERING.md](docs/ENGINEERING.md) and, for anything touching
   `src/`, [docs/TESTING.md](docs/TESTING.md).
5. **Report in the handoff shape below.** A change without a handoff is not finished.

[docs/AGENT_PROTOCOL.md](docs/AGENT_PROTOCOL.md) covers the reasoning, the one read-map exemption,
and what to do when two documents disagree.

## Roles

| Role | Owns |
|---|---|
| [ORCHESTRATOR](agents/ORCHESTRATOR.md) | Routing, read maps, sequencing. Implements nothing. |
| [QA](agents/QA.md) | Tests, the red-green loop, verification evidence |
| [DRAFT_ENGINE](agents/DRAFT_ENGINE.md) | Snake order, pick validation, rosters, clock, auto-draft, commissioner controls |
| [TRADES](agents/TRADES.md) | Trade proposal, validation, lifecycle, roster sync |
| [REALTIME](agents/REALTIME.md) | Channels, events, subscriptions, reconnection, rate limiting |
| [DATABASE](agents/DATABASE.md) | Schema, indexes, constraints, migrations |
| [SECURITY](agents/SECURITY.md) | RLS, the service-role boundary, read-only-client rule |
| [EXTERNAL_DATA](agents/EXTERNAL_DATA.md) | Sleeper import, player cache, ranking sources |
| [AUDIO](agents/AUDIO.md) | Walk-up music, chime, mute, upload |
| [CHAT](agents/CHAT.md) | Activity feed, DMs, reactions, moderation |
| [FRONTEND](agents/FRONTEND.md) | React components, screens, client state |
| [DESIGN_SYSTEM](agents/DESIGN_SYSTEM.md) | Brand, colour, type, spacing, motion, accessibility |
| [CODE_REVIEW](agents/CODE_REVIEW.md) | Reviewing a change against its producing role's constraints |
| [DOCS_STEWARD](agents/DOCS_STEWARD.md) | `AGENTS.md`, `docs/`, `agents/`; contradictions and links |

## Handoff shape

Identical for every role. Role files add their own fields on top of this.

```json
{
  "role": "DRAFT_ENGINE",
  "task": "one line: what you were asked to do",
  "status": "complete | partial | blocked",
  "changed": ["src/lib/draft/pick.ts", "docs/TIMER.md"],
  "verification": {
    "tests": "command run plus literal output, or why it did not apply",
    "typecheck": "command run plus literal output, or why it did not apply",
    "manual": "flow exercised end to end, or null"
  },
  "blockers": [
    {
      "need": "docs/SECURITY.md",
      "why": "the pick write path depends on the service-role boundary",
      "requested_of": "ORCHESTRATOR"
    }
  ],
  "notes": "contradictions found, assumptions made, anything the next role needs"
}
```

For a change touching `src/`, `complete` requires tests green and typecheck clean, with literal
output. Documentation-only changes and roles that produce no diff have a different bar — see
[docs/AGENT_PROTOCOL.md](docs/AGENT_PROTOCOL.md). A `partial` report is correct; a false green is
not.

## Documentation

[docs/README.md](docs/README.md) indexes everything. The four you are most likely to need:

- [docs/AGENT_PROTOCOL.md](docs/AGENT_PROTOCOL.md) — Read maps, handoffs, document authority
- [docs/ENGINEERING.md](docs/ENGINEERING.md) — Code conventions, server authority, Sleeper boundary
- [docs/TESTING.md](docs/TESTING.md) — TDD scope and test setup
- [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) — Branches, commits, pull requests

## Layout

- `/agents` — Role definitions
- `/docs` — Technical documentation
- `/src` — Application source (`app/` routes, `components/`, `lib/` server actions and helpers)
- `/supabase/migrations` — Applied schema and RLS migrations; authoritative over the prose in
  `docs/DATABASE.md` and `docs/SECURITY.md`

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
