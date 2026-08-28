# Documentation Index

Every document in `docs/`, grouped. Role read maps in `agents/` name specific sections of these
files — read what your map names, not the whole group.

## Working agreements

- **[AGENT_PROTOCOL.md](AGENT_PROTOCOL.md)** — Read maps, handoff semantics, and which document
  wins when two disagree
- **[ENGINEERING.md](ENGINEERING.md)** — Code conventions and the two domain invariants
- **[TESTING.md](TESTING.md)** — TDD scope, Vitest setup, test conventions
- **[CONTRIBUTING.md](CONTRIBUTING.md)** — Branches, commits, pull requests

## Foundation

- **[ARCHITECTURE.md](ARCHITECTURE.md)** — Application structure, tech stack, data flow
- **[DEVELOPMENT.md](DEVELOPMENT.md)** — Local environment, env vars, seeding test data
- **[DATABASE.md](DATABASE.md)** — Schema, relationships, constraints
- **[SECURITY.md](SECURITY.md)** — RLS policies, service-role boundary, client write rules

## Draft mechanics

- **[DRAFT_ENGINE.md](DRAFT_ENGINE.md)** — Snake order, pick validation, rosters, completion
- **[TIMER.md](TIMER.md)** — Pick clock, pause/resume, jump-ahead, expired picks
- **[AUTO_DRAFT.md](AUTO_DRAFT.md)** — Auto-pick algorithm and ranking source priority
- **[COMMISSIONER.md](COMMISSIONER.md)** — Undo, manual assign, reset, empty-team control
- **[TRADES.md](TRADES.md)** — Proposal, validation, lifecycle, roster sync

## Experience

- **[REALTIME.md](REALTIME.md)** — Supabase Realtime implementation
- **[NOTIFICATIONS.md](NOTIFICATIONS.md)** — Pick announcement sequence and preferences
- **[AUDIO.md](AUDIO.md)** — Walk-up music upload, playback, chime
- **[CHAT.md](CHAT.md)** — Activity feed, direct messages, moderation

## Interface

- **[DESIGN.md](DESIGN.md)** — Brand, visual system, layout, screens
- **[COMPONENTS.md](COMPONENTS.md)** — React and CSS implementations of the popups and animations

## Integration

- **[SLEEPER.md](SLEEPER.md)** — API integration, data mapping, caching
