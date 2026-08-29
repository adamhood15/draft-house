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

## Working here

Read the docs relevant to what you are touching — not the whole set. Follow
[docs/ENGINEERING.md](docs/ENGINEERING.md) for all code, and [docs/TESTING.md](docs/TESTING.md) for
anything under `src/`. A change to `src/` is not done until tests pass and typecheck is clean; say
so with the literal output.

## Documentation

| Area | Read |
|---|---|
| Conventions, invariants | [ENGINEERING.md](docs/ENGINEERING.md), [TESTING.md](docs/TESTING.md) |
| Structure, local setup | [ARCHITECTURE.md](docs/ARCHITECTURE.md), [DEVELOPMENT.md](docs/DEVELOPMENT.md) |
| Data, access control | [DATABASE.md](docs/DATABASE.md), [SECURITY.md](docs/SECURITY.md) |
| Draft mechanics | [DRAFT_ENGINE.md](docs/DRAFT_ENGINE.md), [TIMER.md](docs/TIMER.md), [AUTO_DRAFT.md](docs/AUTO_DRAFT.md), [COMMISSIONER.md](docs/COMMISSIONER.md), [TRADES.md](docs/TRADES.md) |
| Live experience | [REALTIME.md](docs/REALTIME.md), [NOTIFICATIONS.md](docs/NOTIFICATIONS.md), [AUDIO.md](docs/AUDIO.md), [CHAT.md](docs/CHAT.md) |
| Interface | [DESIGN.md](docs/DESIGN.md), [COMPONENTS.md](docs/COMPONENTS.md) |
| Sleeper integration | [SLEEPER.md](docs/SLEEPER.md) |

## Layout

- `/docs` — Technical documentation
- `/src` — Application source (`app/` routes, `components/`, `lib/` server actions and helpers)
- `/supabase/migrations` — Applied schema and RLS migrations; authoritative over the prose in
  `docs/DATABASE.md` and `docs/SECURITY.md`

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
