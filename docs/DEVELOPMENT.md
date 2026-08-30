# Development Environment

Split out of [ARCHITECTURE.md](ARCHITECTURE.md) — the local development environment, environment variables, and seeding test data from Sleeper.

### Overview

Draft House is developed locally with:
- **Database**: Supabase free tier (cloud) — no local Postgres, no Docker
- **Backend**: Supabase free tier (cloud)
- **Frontend**: Next.js dev server (localhost:3000)
- **Real-time**: Supabase Realtime
- **Deployment**: Vercel (free tier)

This keeps setup simple for a hobby/family project while allowing local testing.

### Environment Variables

Environment variables store configuration that differs between local development and production. They keep secrets out of git and allow easy switching between environments.

#### File Structure

```
draft-house/
├── .env.local              ← Your actual secrets (git-ignored)
├── .env.example            ← Template (committed to git)
├── .env.production.local   ← Production secrets (git-ignored)
└── .gitignore              ← Contains .env.local
```

#### `.env.example` (Commit to Git)

This is the template. Developers copy it to `.env.local` and fill in their own values.

```env
# Supabase - free tier project (no local Postgres/Docker — cloud Supabase only, see below)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Application
NEXT_PUBLIC_APP_URL=http://localhost:3000
NODE_ENV=development

# Sleeper API (public, no secrets)
SLEEPER_API_BASE_URL=https://api.sleeper.app/v1
SLEEPER_API_TIMEOUT=10000
```

#### `.env.local` (Do Not Commit)

Your actual values. Create by copying `.env.example`:

```bash
cp .env.example .env.local
```

Then fill in your real values:

```env
NEXT_PUBLIC_SUPABASE_URL=https://abcdef123456.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiY2RlZjEyMzQ1NiIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNjk3NTU1MjAwLCJleHAiOjE5MzM3MDM0MDB9.ABC123xyz...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiY2RlZjEyMzQ1NiIsInJvbGUiOiJzZXJ2aWNlX3JvbGUiLCJpYXQiOjE2OTc1NTUyMDAsImV4cCI6MTkzMzcwMzQwMH0.XYZ789abc...
NEXT_PUBLIC_APP_URL=http://localhost:3000
NODE_ENV=development
SLEEPER_API_BASE_URL=https://api.sleeper.app/v1
SLEEPER_API_TIMEOUT=10000
```

#### Getting Supabase Keys

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard)
2. Create a free project
3. Go to **Settings** → **API**
4. Copy:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `Anon (Public) Key` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `Service Role Key` → `SUPABASE_SERVICE_ROLE_KEY`

#### Using Environment Variables in Code

**Frontend** (can use `NEXT_PUBLIC_` prefix):

```javascript
// Accessible in browser (public)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const appUrl = process.env.NEXT_PUBLIC_APP_URL;
```

**Backend** (API routes, server-side only):

```javascript
// src/app/api/leagues/import/route.ts
export async function POST(req: Request) {
  // Server-only variables (not exposed to browser)
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // Use them securely on server
}
```

#### `.gitignore` Entry

```
# Environment variables
.env
.env.local
.env.*.local
.env.production.local
!.env.example
```

---

### Seeding Test Data from Sleeper

Seeding means automatically populating your database with test data so you can test the draft without manual setup. This is useful for testing before draft day.

#### Why Seeding?

- ✅ Test draft logic quickly (one command instead of manual import)
- ✅ Reset to clean state between tests
- ✅ Test with realistic data (your actual league)
- ✅ No need to manually import each time

#### Seed Script Structure

The script lives at [`scripts/seed-from-sleeper.js`](../scripts/seed-from-sleeper.js). It is the
source of truth for what seeding does; this document deliberately no longer reproduces it.

A prose copy used to live here and had already drifted from the real thing — it read
`league.settings.scoring_format` (a field Sleeper does not send), seeded `draft_position` from
`roster_id` (Sleeper's team identifier, not its draft slot), and wrote tables that no longer exist.
A second copy of a script is a second thing to keep correct, and this one was not.

**What it does, in order:**

1. Fetches the league, its rosters and its users from Sleeper in parallel, then fetches the draft by
   `league.draft_id` — not `/league/<id>/drafts`, whose array spans prior seasons.
2. Clears existing data in FK-safe order. Note `reactions` and `chat_messages` come before
   `draft_picks`, which is a parent now that slots and picks are one table.
3. Creates the `leagues` row.
4. Creates the `drafts` row — Sleeper's draft object, with `rounds` and `pick_timer` promoted to
   real columns and `settings`/`metadata` kept verbatim as provenance.
5. Creates `teams`, seating them via `assignDraftPositions` — the same module the app import uses,
   so seeded seats and imported seats can never disagree.

**Where it stops:** the lobby. `draft_picks` and `rosters` are written by `startDraft`
([`src/lib/draft/start.ts`](../src/lib/draft/start.ts)) when the commissioner starts the draft.
Pre-creating them here would both duplicate the pick-order algorithm and make `startDraft` fail on
its own uniqueness constraints.

**Warnings, not failures.** Anything Sleeper sends that Draft House cannot represent — an auction
draft, a third-round reversal, a missing pick clock — is printed as a warning and seeded with a
usable fallback the commissioner can change on the setup page. A seed that refuses to run because
Sleeper used an order type we lack is worse than one that says so and carries on.

#### Add to `package.json`

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "seed": "node scripts/seed-from-sleeper.js",
    "seed:reset": "npm run seed"
  },
  "devDependencies": {
    "dotenv": "^16.0.0"
  }
}
```

#### Usage

**First time setup:**

1. Add to `.env.local`:
   ```env
   SLEEPER_LEAGUE_ID=1234567890
   ```
   (Replace with your actual Sleeper league ID)

2. Run seed:
   ```bash
   npm run seed
   ```

   Output:
   ```
   🌱 Starting database seed from Sleeper...
   📥 Fetching Sleeper league: 1234567890
   ✅ Fetched league data (12 teams)
   🗑️  Clearing existing test data...
   ✅ Database cleared
   📋 Creating league...
   ✅ League created: league_abc123
   ⚙️  Creating draft settings...
   ✅ Draft settings created
   🏈 Creating teams...
   ✅ Created 12 teams
   🕒 Creating draft state...
   ✅ Draft state initialized (paused for review)
   ==================================================
   🎉 Database seeded successfully!
   ==================================================
   ```

3. Start your dev server:
   ```bash
   npm run dev
   ```

**Testing multiple times:**

Each time you want to reset and test:

```bash
npm run seed:reset  # Clears database and refills from Sleeper
npm run dev         # Start fresh test
```

#### What the Seed Does

1. ✅ Fetches your real Sleeper league
2. ✅ Clears existing test data
3. ✅ Creates league in Draft House
4. ✅ Creates draft settings
5. ✅ Creates 12 teams (or however many)
6. ✅ Initializes draft state (paused)
7. ✅ Ready to test

---

### Why Not Supabase Emulator?

We're **skipping the local Supabase emulator** for these reasons:

- ✅ **Simpler setup**: One less tool to install/manage
- ✅ **Cloud parity**: Testing against real Supabase free tier is identical to production
- ✅ **Works offline after initial setup**: Once data is synced, local testing works
- ✅ **For a hobby project**: Unnecessary complexity
- ✅ **Real-time testing**: Supabase free tier realtime works perfectly for 12 users

If we added the emulator:
- ❌ Docker dependency (we avoided)
- ❌ Extra configuration
- ❌ Emulator might not match cloud exactly
- ❌ Minimal benefit for one draft per year

Instead, we use the real Supabase free tier, which is generous and reliable.

---

### Local Development Checklist

Before testing the draft:

- [ ] Supabase project created, migrations applied (`npm run supabase:push`)
- [ ] `.env.local` configured with Supabase keys
- [ ] `npm install` completed
- [ ] `npm run seed` executed successfully
- [ ] `npm run dev` started (localhost:3000)
- [ ] Draft state shows in browser (pause/resume works)
- [ ] Can make test picks
- [ ] Real-time updates show across multiple browsers (open http://localhost:3000 in two windows)

---

## See Also

- [ARCHITECTURE.md](ARCHITECTURE.md) — The document this was split out of
- [DATABASE.md](DATABASE.md) — Schema the seed script populates
- [SLEEPER.md](SLEEPER.md) — API the seed script pulls from
- [AGENTS.md](../AGENTS.md) — Project overview
