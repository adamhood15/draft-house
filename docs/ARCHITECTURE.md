# Architecture

This document describes the overall application architecture, tech stack, and data flow for Draft House.

## Tech Stack

### Frontend
- **Framework**: Next.js, App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS (unconfigured beyond defaults until [DESIGN.md](docs/DESIGN.md)'s color/typography decisions land)
- **State Management**: No state library — plain React state plus custom hooks wrapping Supabase Realtime subscriptions (the pattern already used throughout [REALTIME.md](docs/REALTIME.md) and [CHAT.md](docs/CHAT.md), e.g. `useDraftState`, `useUnreadMessageCount`)
- **Real-time Client**: Supabase JavaScript client
- **Audio**: Web Audio API / HTML5 audio element

### Backend
- **Runtime**: Node.js
- **Database**: Supabase (PostgreSQL)
- **Real-time**: Supabase Realtime (WebSocket)
- **Storage**: Supabase Storage (audio files)
- **Authentication**: Supabase Auth (username/password only)
- **External APIs**: Sleeper API

### Deployment
- **Vercel** (free tier) — matches the Next.js app router setup and the free-tier dev environment described below; revisit only if traffic/cost ever outgrows a single hobby-project league

## High-Level Architecture

```
┌──────────────┐
│  Web Browser │
│   (Next.js)  │
└──────┬───────┘
       │
       ├─── HTTP/HTTPS ─────────────────┐
       │                                │
       └─── WebSocket (Realtime) ──────┐│
                                       ││
                    ┌──────────────────┘│
                    │                   │
              ┌─────▼─────────────────┐ │
              │  Supabase Backend     │◄┘
              │ - Database (PostgreSQL)
              │ - Realtime (WebSocket)
              │ - Authentication      │
              │ - Storage             │
              └────┬──────────────────┘
                   │
        ┌──────────┴────────────┐
        │                       │
   ┌────▼────────┐     ┌───────▼──────┐
   │  Sleeper    │     │  Storage     │
   │  API        │     │  (Audio)     │
   └─────────────┘     └──────────────┘
```

## Core Concepts

### 1. Commissioner-Driven Setup

The commissioner controls the Draft House experience:

```
Commissioner
    │
    ├─→ Create Draft House Account
    │
    ├─→ Import Sleeper League
    │    └─→ Retrieve league data
    │
    ├─→ Review & Edit League Settings
    │
    ├─→ Review & Edit Draft Settings
    │
    ├─→ Claim Commissioner Team
    │
    ├─→ Generate Shareable Invite Link
    │
    ├─→ Host Live Draft
    │    ├─→ Pause/Resume draft
    │    ├─→ Edit timer
    │    ├─→ Undo picks
    │    ├─→ Manually assign players
    │    └─→ Control empty teams (auto vs. manual)
```

### 2. Player Entry Flow

League members join through the invite link:

```
League Member
    │
    ├─→ Click Invite Link
    │
    ├─→ Not logged in?
    │   └─→ Create Account (username/password)
    │
    ├─→ Claim Available Team
    │
    ├─→ Customize Team
    │    ├─→ Edit team name
    │    ├─→ Upload team image
    │    └─→ Upload walk-up song
    │
    ├─→ Join Draft Lobby
    │
    ├─→ Wait for Draft Start (or commissioner starts immediately)
    │
    └─→ Draft Room (live draft participation)
```

### 3. Real-Time Data Flow

During the draft, changes flow through Supabase Realtime:

```
Player A                    Database                  Player B
makes pick                    │                        (browser)
  │                           │                           │
  └──→ HTTP POST pick ────→ PostgreSQL ←─ Realtime event ─┘
  │                       (write & notify)
  │
  │ Realtime subscription
  └──────────────────────→ Browser updates
```

See [REALTIME.md](docs/REALTIME.md) for detailed real-time synchronization.

## Key Application Areas

### Authentication & Authorization

**Scope**: User accounts, login, session management

**Rules**:
- No external identity providers (Google, Apple, Facebook)
- Username/password only — users never provide a real email address
- Supabase Auth requires an email identifier internally; signup generates a synthetic one (`{username}@drafthouse.invalid`) behind the scenes (see [DATABASE.md](docs/DATABASE.md#1-users))
- Sessions managed by Supabase Auth
- Commissioner verification for admin operations

**See**: Database schema in [DATABASE.md](docs/DATABASE.md)

### Sleeper Integration

**Scope**: One-time import of league configuration

**Process**:
1. Commissioner provides Sleeper league ID
2. Application retrieves league data from Sleeper API
3. Data is transformed and stored in Draft House database
4. Commissioner reviews and edits settings
5. After confirmation, Sleeper remains the reference only for specific lookups (e.g., player rankings for auto-draft)

**See**: [SLEEPER.md](docs/SLEEPER.md) for API details, data mapping, and caching

### Draft Management

**Scope**: Pick order, timing, validation, undo/redo

**Rules**:
- Snake draft format (first team gets 1.01, last team gets 1.12, then last team gets 2.01, etc.)
- Server-authoritative timer
- Commissioner can pause, edit, reset clock
- Commissioner can manually assign players or undo picks
- Empty teams can be auto-drafted or manually managed
- Roster validation before accepting picks

**See**: [DRAFT_ENGINE.md](docs/DRAFT_ENGINE.md) for detailed draft logic

### Real-Time Synchronization

**Scope**: Live updates for draft activity, chat, reactions, audio

**Technology**: Supabase Realtime (WebSocket-based PostgreSQL change subscriptions)

**Events**:
- Pick made
- Chat message sent
- Reaction added
- Draft clock updated
- Commissioner action (pause, undo, etc.)

**See**: [REALTIME.md](docs/REALTIME.md) for implementation details

### Audio Management

**Scope**: Walk-up song upload, storage, and playback

**Rules**:
- Upload during account creation or team claiming
- Stored in Supabase Storage
- Only plays during Round 1
- Users can mute music without muting draft sounds

**See**: [AUDIO.md](docs/AUDIO.md) for technical details

### Chat & Activity

**Scope**: Public draft activity feed, direct messages, reactions

**Features**:
- Public activity feed (picks + chat messages + reactions)
- Private direct messages between players
- Emoji reactions to picks
- Real-time updates

**See**: [CHAT.md](docs/CHAT.md) for data model and implementation

## Data Model Overview

**Key Entities**:
- Users (accounts, display names)
- Leagues (imported from Sleeper)
- Teams (per league)
- Draft State (current pick, timer, paused/resumed)
- Picks (history of all picks in draft)
- Chat Messages (public activity + private DMs)
- Reactions (emoji reactions to picks)
- Walk-up Songs (stored in Supabase Storage)

**See**: [DATABASE.md](docs/DATABASE.md) for complete schema

## Security Considerations

### Authentication

- Supabase Auth handles session management
- No passwords stored in application code
- Session tokens validated on API calls

### Authorization

- Users can only view their own private messages
- Users can only manage their own team
- Commissioner status verified server-side before admin actions
- Draft operations are server-verified (client cannot manipulate picks directly)

### Data Privacy

- Walk-up songs stored in Supabase Storage (access control TBD)
- Chat messages only accessible to conversation participants
- User passwords never logged or transmitted in plain text

## Performance Considerations

### Real-Time Updates

- Supabase Realtime uses WebSockets (efficient for frequent updates)
- Subscriptions scoped to relevant data (draft, team, activity)
- Message debouncing for high-frequency events (timer ticks)

### Database Queries

- Indexes on frequently queried columns (TBD: league_id, draft_id, user_id)
- Paginated chat/activity feed to avoid loading entire conversation history

### Media Storage

- Walk-up songs stored in Supabase Storage, not database
- File size limits TBD (e.g., 5-10 MB per song)
- CDN delivery for audio playback

### Frontend

- Next.js static generation for non-dynamic pages
- Lazy loading for team images and audio
- Optimized re-renders using React.memo / useMemo

## Deployment Architecture

**Platform**: Vercel (free tier) — see the Development Environment section below for the full local/prod setup

Considerations:
- Next.js API routes run as Vercel serverless functions
- PostgreSQL connection pooling handled by Supabase (pgbouncer)
- CDN for static assets and media handled by Vercel's edge network + Supabase Storage
- Monitoring and error tracking: TBD (Vercel's built-in logs are sufficient at this scale for now; revisit only if needed)

## Future Extensibility

### Potential Areas for Growth

- **Multiple draft formats**: Standard PPR variants, best-ball, etc.
- **Draft history**: Archive past drafts, player stats, trends
- **Mobile app**: Native iOS/Android client
- **Commissioner tools**: Advanced roster management, rule enforcement
- **Integration with other platforms**: ESPN, Yahoo Fantasy Football
- **Social features**: Follow other leagues, leaderboards

The current architecture is designed to support these extensions without major restructuring.

## Architecture Decisions & Rationale

### Why Supabase?

- **All-in-one**: Database, auth, real-time, storage
- **PostgreSQL**: Reliable, well-understood relational data
- **Real-time**: WebSocket subscriptions for live draft updates
- **Affordable**: Generous free tier; pay-as-you-go for production

### Why Next.js?

- **Hybrid rendering**: Server-side rendering where needed, static generation where possible
- **API routes**: Backend in the same repository as frontend
- **Ecosystem**: Rich middleware, plugins, and library support
- **Developer experience**: Hot module reloading, TypeScript support out of the box

### Why Sleeper for Import?

- **Official API**: Reliable data source for league configuration
- **One-time use**: Simplifies architecture (import, then manage independently)
- **Flexibility**: Commissioner can adjust any setting after import

## Contact & Questions

See [AGENTS.md](AGENTS.md) for overall project information and guidance.
