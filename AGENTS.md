# AGENTS.md

Draft House is a private, real-time fantasy football draft experience for family and friends. Users import an existing Sleeper league, customize the draft configuration, invite league members through a shared URL, and host a live draft with social features including walk-up music, live chat, and emoji reactions.

This project uses npm.

## Quick Start

```bash
npm install
npm run dev
```

## Core Concepts

- **Sleeper Integration**: Initial league configuration is imported from Sleeper. Draft House settings are independent of Sleeper after import.
- **Commissioner-Driven**: The commissioner controls league setup, invites, and draft administration.
- **Real-time Synchronization**: Uses Supabase Realtime for live draft updates across all connected clients.
- **Social Experience**: Walk-up music, live activity feed, chat, and emoji reactions make the draft entertaining.

## For Detailed Guidance, See:

- **[Architecture](ARCHITECTURE.md)** — Application structure, tech stack, data flow
- **[Database](docs/DATABASE.md)** — Schema, relationships, constraints
- **[Sleeper Integration](docs/SLEEPER.md)** — API integration, data mapping, sync behavior
- **[Draft Engine](docs/DRAFT_ENGINE.md)** — Snake draft logic, pick order, timer, validation
- **[Real-time Sync](docs/REALTIME.md)** — Supabase Realtime implementation
- **[Audio](docs/AUDIO.md)** — Walk-up music upload, playback, synchronization
- **[Chat](docs/CHAT.md)** — Activity feed, direct messages, moderation
- **[Design](docs/DESIGN.md)** — Brand, visual system, layout, components

## Important Principles

- **Single Source of Truth**: `AGENTS.md` is the single documentation root. Domain-specific guidance is progressively disclosed through the `docs/` directory.
- **Minimal Context Bloat**: Instructions are split across focused documents to keep context consumption low for AI agents.
- **Sleeper as Initialization**: Sleeper data initializes Draft House but does not continuously govern it. Draft House maintains its own state.
- **Server Authority**: Draft operations (clock, picks, undo) are server-verified to prevent client-side manipulation.

## Environment

- Node.js 20+ (LTS)
- npm
- Database: Supabase PostgreSQL
- Authentication: Username/password (no external identity providers)
- Real-time: Supabase Realtime

## Key Files & Directories

- `/src` — Application source code (TBD)
- `/docs` — Detailed technical documentation
- `.env.example` — Environment variables template (TBD)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on branches, commits, tests, and pull requests.

## License

MIT — see [LICENSE](LICENSE)

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
