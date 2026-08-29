# Draft House

A private, real-time fantasy football draft application. Import an existing Sleeper league,
customize the draft, invite league members by shared link, and host a live draft with walk-up
music, chat, and emoji reactions.

Start at [AGENTS.md](AGENTS.md) — it carries the commands and the conventions. This file is the
map of everything below it.

## Documentation Index

Every document in `docs/`, grouped. Read what the work in front of you needs, not the whole group.

## Working agreements

- **[ENGINEERING.md](docs/ENGINEERING.md)** — Code conventions and the two domain invariants
- **[TESTING.md](docs/TESTING.md)** — TDD scope, Vitest setup, test conventions

## Foundation

- **[ARCHITECTURE.md](docs/ARCHITECTURE.md)** — Application structure, tech stack, data flow
- **[DEVELOPMENT.md](docs/DEVELOPMENT.md)** — Local environment, env vars, seeding test data
- **[DATABASE.md](docs/DATABASE.md)** — Schema, relationships, constraints
- **[SECURITY.md](docs/SECURITY.md)** — RLS policies, service-role boundary, client write rules

## Draft mechanics

- **[DRAFT_ENGINE.md](docs/DRAFT_ENGINE.md)** — Snake order, pick validation, rosters, completion
- **[TIMER.md](docs/TIMER.md)** — Pick clock, pause/resume, jump-ahead, expired picks
- **[AUTO_DRAFT.md](docs/AUTO_DRAFT.md)** — Auto-pick algorithm and ranking source priority
- **[COMMISSIONER.md](docs/COMMISSIONER.md)** — Undo, manual assign, reset, empty-team control
- **[TRADES.md](docs/TRADES.md)** — Proposal, validation, lifecycle, roster sync

## Experience

- **[REALTIME.md](docs/REALTIME.md)** — Supabase Realtime implementation
- **[NOTIFICATIONS.md](docs/NOTIFICATIONS.md)** — Pick announcement sequence and preferences
- **[AUDIO.md](docs/AUDIO.md)** — Walk-up music upload, playback, chime
- **[CHAT.md](docs/CHAT.md)** — Activity feed, direct messages, moderation

## Interface

- **[DESIGN.md](docs/DESIGN.md)** — Brand, visual system, layout, screens
- **[COMPONENTS.md](docs/COMPONENTS.md)** — React and CSS implementations of the popups and animations

## Integration

- **[SLEEPER.md](docs/SLEEPER.md)** — API integration, data mapping, caching
