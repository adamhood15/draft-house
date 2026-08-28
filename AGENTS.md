# AGENTS.md

Draft House is a private, real-time fantasy football draft experience for family and friends. Users import an existing Sleeper league, customize the draft configuration, invite league members through a shared URL, and host a live draft with social features including walk-up music, live chat, and emoji reactions.

This project uses npm.

## Quick Start

```bash
npm install
npm run dev
```

## How Agents Work Here

Work in this repository is done by role-scoped agents. Each role has a **read map** naming the
exact documents and sections its tasks require, so an agent loads the context for the job and not
the whole documentation set.

Startup sequence, every time:

1. **Identify your role.** If you were not given one, you are the Orchestrator — route the work,
   do not do it.
2. **Open your role file** at `agents/<ROLE>.md`. Read its Read Map, Hard Constraints, and Out of
   Scope table before anything else.
3. **Read only what your map names for the task at hand** — the named sections, not the whole file,
   unless the map says "whole file".
4. **Check the Out of Scope table first** if the request feels adjacent to your area. Routing early
   is cheaper than discovering it late.
5. **Do the work** under the Universal Rules below.
6. **Report in the handoff format.** A change without a handoff is not finished.

### The read-map contract

If you believe you need a document outside your read map, **do not read it**. Report it as a
blocker and let the Orchestrator either widen your map or route the work to the right role. An
agent silently expanding its own scope is the failure mode this structure exists to prevent.

This is a rule, not a preference. "I only glanced at it" is the same violation as reading it in
full: the point is that the Orchestrator can see when a role's boundary was drawn wrong, and a
silent read makes that invisible.

### Roles

| Role | Owns | File |
|---|---|---|
| `ORCHESTRATOR` | Routing, read maps, sequencing. Implements nothing. | [agents/ORCHESTRATOR.md](agents/ORCHESTRATOR.md) |
| `QA` | Tests, the red-green loop, verification evidence | [agents/QA.md](agents/QA.md) |
| `DRAFT_ENGINE` | Snake order, pick validation, rosters, clock, auto-draft, commissioner controls | [agents/DRAFT_ENGINE.md](agents/DRAFT_ENGINE.md) |
| `TRADES` | Trade proposal, validation, lifecycle, roster sync | [agents/TRADES.md](agents/TRADES.md) |
| `REALTIME` | Channels, events, subscriptions, reconnection, rate limiting | [agents/REALTIME.md](agents/REALTIME.md) |
| `DATABASE` | Schema, indexes, constraints, migrations | [agents/DATABASE.md](agents/DATABASE.md) |
| `SECURITY` | RLS, the service-role boundary, read-only-client rule | [agents/SECURITY.md](agents/SECURITY.md) |
| `EXTERNAL_DATA` | Sleeper import, player cache, ranking sources | [agents/EXTERNAL_DATA.md](agents/EXTERNAL_DATA.md) |
| `AUDIO` | Walk-up music, chime, mute, upload | [agents/AUDIO.md](agents/AUDIO.md) |
| `CHAT` | Activity feed, DMs, reactions, moderation | [agents/CHAT.md](agents/CHAT.md) |
| `FRONTEND` | React components, screens, client state | [agents/FRONTEND.md](agents/FRONTEND.md) |
| `DESIGN_SYSTEM` | Brand, colour, type, spacing, motion, accessibility | [agents/DESIGN_SYSTEM.md](agents/DESIGN_SYSTEM.md) |
| `CODE_REVIEW` | Reviewing a change against its producing role's constraints | [agents/CODE_REVIEW.md](agents/CODE_REVIEW.md) |
| `DOCS_STEWARD` | `AGENTS.md`, `docs/`, `agents/`; contradictions and links | [agents/DOCS_STEWARD.md](agents/DOCS_STEWARD.md) |

### Handoff format

Every role reports in this shape. Nothing else counts as completion.

```json
{
  "role": "DRAFT_ENGINE",
  "task": "one line: what you were asked to do",
  "status": "complete | partial | blocked",
  "changed": ["src/lib/draft/pick.ts", "docs/TIMER.md"],
  "verification": {
    "tests": "command run plus literal output, or 'not run' plus why",
    "typecheck": "command run plus literal output, or 'not run' plus why",
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

`status: "complete"` requires tests green and typecheck clean, with literal output. If a step was
skipped or failed, say so — a `partial` report is correct, a false green is not. Individual role
files add one or two role-specific fields to this shape.

## Universal Rules

These bind every role.

- **TDD is mandatory.** Every change follows failing test first → implement → verify:
  1. Write the tests that capture the desired behaviour and watch them **fail** (red).
  2. Implement the minimum to make them pass.
  3. Run the suite and typecheck, and confirm green.
- **Verify before claiming done.** Never report something as working without running it. "Done"
  means relevant tests green, typecheck clean, and — for a user-facing flow — exercised end to end.
  If a test fails or a step was skipped, say so plainly, with the output.
- **Server authority.** Draft operations (clock, picks, undo) are server-verified. The client may
  request; it may never decide. Draft-mechanics tables are written by the service role only, with
  `trade_offers` and `trade_offer_items` as the single documented exception.
- **Single source of truth.** One fact has one home. When two documents describe the same
  behaviour, one is authoritative and the other links to it. Never leave two live copies —
  divergence is how two agents come to build two different behaviours.
- **Stay in scope.** Work the request, not the surrounding area. Out-of-scope findings are reported
  in `notes`, not fixed silently.
- **Sleeper initializes; it does not govern.** Sleeper data seeds Draft House at import. After
  that, Draft House owns its own state.
- **D.R.Y.** Do not repeat yourself — in code, in docs, or in configuration.
- **Explicit naming.** Variables and functions are named for what they contain or do, not
  abstractly.

## Core Concepts

- **Sleeper Integration**: Initial league configuration is imported from Sleeper. Draft House settings are independent of Sleeper after import.
- **Commissioner-Driven**: The commissioner controls league setup, invites, and draft administration.
- **Real-time Synchronization**: Uses Supabase Realtime for live draft updates across all connected clients.
- **Social Experience**: Walk-up music, live activity feed, chat, and emoji reactions make the draft entertaining.

## Documentation Index

**Foundation**

- **[Architecture](docs/ARCHITECTURE.md)** — Application structure, tech stack, data flow
- **[Development](docs/DEVELOPMENT.md)** — Local environment, env vars, seeding test data
- **[Database](docs/DATABASE.md)** — Schema, relationships, constraints
- **[Security](docs/SECURITY.md)** — RLS policies, service-role boundary, client write rules

**Draft mechanics**

- **[Draft Engine](docs/DRAFT_ENGINE.md)** — Snake order, pick validation, rosters, completion
- **[Timer](docs/TIMER.md)** — Pick clock, pause/resume, jump-ahead, expired picks
- **[Auto-Draft](docs/AUTO_DRAFT.md)** — Auto-pick algorithm and ranking source priority
- **[Commissioner](docs/COMMISSIONER.md)** — Undo, manual assign, reset, empty-team control
- **[Trades](docs/TRADES.md)** — Proposal, validation, lifecycle, roster sync

**Experience**

- **[Real-time Sync](docs/REALTIME.md)** — Supabase Realtime implementation
- **[Notifications](docs/NOTIFICATIONS.md)** — Pick announcement sequence and preferences
- **[Audio](docs/AUDIO.md)** — Walk-up music upload, playback, chime
- **[Chat](docs/CHAT.md)** — Activity feed, direct messages, moderation

**Interface**

- **[Design](docs/DESIGN.md)** — Brand, visual system, layout, screens
- **[Components](docs/COMPONENTS.md)** — React and CSS implementations of the popups and animations

**Integration**

- **[Sleeper](docs/SLEEPER.md)** — API integration, data mapping, caching

## Spec vs. Implementation

Some behaviour is described twice on purpose: once as intent, once as code. When the two disagree,
the side marked authoritative wins and `DOCS_STEWARD` reconciles the other.

| Behaviour | Spec | Implementation | Authoritative |
|---|---|---|---|
| Pick announcement sequence, notification preferences | `docs/NOTIFICATIONS.md` | `docs/COMPONENTS.md` | Spec |
| Trade announcements and lifecycle | `docs/TRADES.md` | `docs/COMPONENTS.md` | Spec |
| Draft chime | `docs/AUDIO.md` — Draft Chime | `src/lib/audio.ts` *(TBD)* | Spec |
| Walk-up song upload | `docs/AUDIO.md` — Upload Technical Details | `src/lib/storage.ts` | Implementation |
| RLS policies | `docs/SECURITY.md` | `supabase/migrations/*_rls_policies.sql` | Implementation |
| Schema | `docs/DATABASE.md` | `supabase/migrations/` | Implementation |

## Environment

- Node.js 20+ (LTS)
- npm
- Database: Supabase PostgreSQL
- Authentication: Username/password (no external identity providers)
- Real-time: Supabase Realtime

## Key Files & Directories

- `/agents` — Role definitions: read maps, constraints, routing
- `/docs` — Detailed technical documentation
- `/src` — Application source code
  - `/src/app` — Next.js App Router routes
  - `/src/components` — Shared React components
  - `/src/lib` — Server actions and helpers: `auth/`, `leagues/`, `sleeper/`, `supabase/`,
    `storage.ts`, `media-constraints.ts`. **`src/lib/audio.ts` is referenced by
    `docs/COMPONENTS.md` but does not exist yet.**
- `/supabase/migrations` — Applied schema and RLS migrations; authoritative over the prose in
  `docs/DATABASE.md` and `docs/SECURITY.md`
- `vitest.config.mts`, `vitest.setup.ts` — Test runner config; tests live beside the code as
  `src/**/*.test.ts{,x}`
- `.env.example` — Environment variables template

Commands: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for branches, commits, verification, and pull requests.

## License

MIT — see [LICENSE](LICENSE)

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
