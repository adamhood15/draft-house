# Development Environment

Split out of [ARCHITECTURE.md](ARCHITECTURE.md) — the local development environment, environment variables, and seeding test data from Sleeper.

### Overview

Draft House is developed locally with:
- **Database**: Local PostgreSQL (not Docker)
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

Create `scripts/seed-from-sleeper.js`:

```javascript
// scripts/seed-from-sleeper.js
require('dotenv').config({ path: '.env.local' });

const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client with service role key (more permissions)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Fetch from Sleeper API
const fetchFromSleeper = async (path) => {
  const res = await fetch(`https://api.sleeper.app/v1${path}`);
  if (!res.ok) {
    throw new Error(`Sleeper API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
};

async function seedDatabase() {
  try {
    console.log('🌱 Starting database seed from Sleeper...\n');

    // ========================================
    // 1. FETCH SLEEPER LEAGUE DATA
    // ========================================
    const leagueId = process.env.SLEEPER_LEAGUE_ID || 'YOUR_LEAGUE_ID_HERE';
    
    if (leagueId === 'YOUR_LEAGUE_ID_HERE') {
      console.error('❌ Error: Set SLEEPER_LEAGUE_ID in .env.local');
      process.exit(1);
    }

    console.log(`📥 Fetching Sleeper league: ${leagueId}`);
    
    const [league, rosters, users] = await Promise.all([
      fetchFromSleeper(`/league/${leagueId}`),
      fetchFromSleeper(`/league/${leagueId}/rosters`),
      fetchFromSleeper(`/league/${leagueId}/users`)
    ]);

    console.log(`✅ Fetched league data (${league.league_size} teams)\n`);

    // ========================================
    // 2. CLEAR EXISTING DATA
    // ========================================
    console.log('🗑️  Clearing existing test data...');
    
    // Delete in reverse dependency order
    await supabase.from('reactions').delete().gt('id', '0');
    await supabase.from('direct_messages').delete().gt('id', '0');
    await supabase.from('direct_message_conversations').delete().gt('id', '0');
    await supabase.from('chat_messages').delete().gt('id', '0');
    await supabase.from('picks').delete().gt('id', '0');
    await supabase.from('draft_state').delete().gt('id', '0');
    await supabase.from('teams').delete().gt('id', '0');
    await supabase.from('draft_settings').delete().gt('id', '0');
    await supabase.from('leagues').delete().gt('id', '0');

    console.log('✅ Database cleared\n');

    // ========================================
    // 3. CREATE LEAGUE
    // ========================================
    console.log('📋 Creating league...');
    
    // Parse scoring format from Sleeper settings
    const scoringFormat = league.settings?.scoring_format || 'ppr';

    const { data: leagueData, error: leagueError } = await supabase
      .from('leagues')
      .insert({
        name: league.name,
        sleeper_league_id: league.league_id,
        season: league.season,
        league_size: league.league_size,
        scoring_format: scoringFormat,
        draft_format: 'snake',
        rosters_per_team: league.settings?.roster_positions?.length || 15,
        positions: buildPositionsJson(league.settings?.roster_positions),
        league_settings: league.settings,
        draft_status: 'setup',
        commissioner_id: null  // Will be set during app setup
      })
      .select()
      .single();

    if (leagueError) throw leagueError;
    const draftHouseLeagueId = leagueData.id;

    console.log(`✅ League created: ${leagueData.id}\n`);

    // ========================================
    // 4. CREATE DRAFT SETTINGS
    // ========================================
    console.log('⚙️  Creating draft settings...');

    const { error: settingsError } = await supabase
      .from('draft_settings')
      .insert({
        league_id: draftHouseLeagueId,
        seconds_per_pick: league.settings?.seconds_per_pick || 60,
        allow_pick_trading: false,
        auto_draft_enabled: false,
        auto_draft_type: 'sleeper_rankings'
      });

    if (settingsError) throw settingsError;
    console.log('✅ Draft settings created\n');

    // ========================================
    // 5. CREATE TEAMS
    // ========================================
    console.log('🏈 Creating teams...');

    const teamsToInsert = rosters.map((roster) => {
      const user = users.find(u => u.user_id === roster.owner_id);
      
      return {
        league_id: draftHouseLeagueId,
        sleeper_user_id: roster.owner_id,
        sleeper_team_name: roster.metadata?.team_name || `Team ${roster.roster_id}`,
        draft_house_team_name: roster.metadata?.team_name || `Team ${roster.roster_id}`,
        team_image_url: roster.metadata?.avatar || null,
        draft_position: roster.roster_id,
        is_auto_draft: false,
        family_league_wins: 0,
        team_anecdote: null
      };
    });

    const { data: teamsData, error: teamsError } = await supabase
      .from('teams')
      .insert(teamsToInsert)
      .select();

    if (teamsError) throw teamsError;
    console.log(`✅ Created ${teamsData.length} teams\n`);

    // ========================================
    // 6. CREATE DRAFT STATE
    // ========================================
    console.log('🕒 Creating draft state...');

    const firstTeamId = teamsData[0].id;
    
    const { error: draftStateError } = await supabase
      .from('draft_state')
      .insert({
        league_id: draftHouseLeagueId,
        current_pick_number: 1,
        current_team_id: firstTeamId,
        current_round: 1,
        timer_seconds: 60,
        timer_paused: true,  // Start paused so you can review before testing
        draft_started_at: null,
        draft_ended_at: null
      });

    if (draftStateError) throw draftStateError;
    console.log('✅ Draft state initialized (paused for review)\n');

    // ========================================
    // 7. SUCCESS
    // ========================================
    console.log('═'.repeat(50));
    console.log('🎉 Database seeded successfully!');
    console.log('═'.repeat(50));
    console.log(`
League: ${league.name}
  - ID: ${draftHouseLeagueId}
  - Teams: ${teamsData.length}
  - Format: ${scoringFormat.toUpperCase()}
  
Ready to test! Start the draft at: http://localhost:3000
    `);

  } catch (error) {
    console.error('❌ Seed failed:', error.message);
    process.exit(1);
  }
}

// Helper function to build positions JSON
function buildPositionsJson(rosterPositions) {
  if (!rosterPositions) {
    return { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, DEF: 1, BN: 6 };
  }

  const positions = {};
  for (const pos of rosterPositions) {
    positions[pos] = (positions[pos] || 0) + 1;
  }
  return positions;
}

// Run the seed
seedDatabase();
```

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

- [ ] PostgreSQL installed and running
- [ ] `.env.local` configured with Supabase keys
- [ ] `npm install` completed
- [ ] `npm run seed` executed successfully
- [ ] `npm run dev` started (localhost:3000)
- [ ] Draft state shows in browser (pause/resume works)
- [ ] Can make test picks
- [ ] Real-time updates show across multiple browsers (open http://localhost:3000 in two windows)

