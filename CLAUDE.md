# CLAUDE.md — Baseball Coaches App

This file provides guidance for AI assistants (Claude and others) working on this repository. Keep it up-to-date as the project evolves.

---

## Project Overview

**baseballcoachesapp** is a full-stack coaching platform for high school and youth baseball. It covers five pillars:

1. **Scorekeeping** — offline-first pitch-by-pitch event logging with real-time live score streaming for parents
2. **Communication** — tiered channels (announcement, topic, DM), push notifications, RSVP tracking
3. **Practices** — drill library, drag-and-drop practice builder, multimedia CDN *(v2)*
4. **Administration** — pitch count compliance (NFHS / Little League / NCAA rules), MaxPreps export, FERPA-compliant roster/user management
5. **Statistics** — event-sourced aggregation, Quality At-Bats, spray charts, scouting reports *(v2)*

---

## Repository Status

| Item | Status |
|------|--------|
| Initialized | Yes |
| Source code | Phase 1 complete — monorepo scaffold, packages, Supabase schema, web + mobile apps |
| Tests | Not yet configured (add tests alongside business logic in `packages/shared/src/utils/`) |
| CI/CD | Not yet configured |
| Documentation | CLAUDE.md + inline code comments |

---

## Development Workflow

### Branching Strategy

- `main` (or `master`) — stable, production-ready code
- `dev` / `develop` — integration branch for features
- `feature/<short-description>` — individual feature work
- `fix/<short-description>` — bug fixes
- `claude/<task-description>-<session-id>` — AI-assisted work branches

Always branch off `main` (or the designated integration branch) and open a pull request to merge back.

### Commit Messages

Use the [Conventional Commits](https://www.conventionalcommits.org/) format:

```
<type>(<scope>): <short summary>

[optional body]
[optional footer]
```

Common types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `style`

Examples:
```
feat(roster): add player import from CSV
fix(stats): correct ERA calculation for partial innings
docs: add CLAUDE.md with project conventions
```

### Pull Requests

- Title should match the commit message style above
- Include a description of what changed and why
- Link to any relevant issues
- All CI checks must pass before merging

---

## Commands

### Install Dependencies
```bash
pnpm install
```

### Run Development Servers
```bash
# All apps in parallel (via Turborepo)
pnpm dev

# Web only (Next.js on http://localhost:3000)
pnpm dev:web

# Mobile only (Expo — opens in Expo Go or simulator)
pnpm dev:mobile
```

### Run Tests
```bash
pnpm test
```

### Build for Production
```bash
# Web (Next.js)
pnpm build

# Mobile iOS (via Expo EAS)
pnpm --filter mobile build:ios

# Mobile Android
pnpm --filter mobile build:android
```

### Lint / Format
```bash
pnpm lint
pnpm format          # write
pnpm format:check    # check only (CI)
```

### Type Check
```bash
pnpm type-check
```

### Supabase (local dev)
```bash
# Start local Supabase stack (requires Docker)
supabase start

# Apply all migrations
supabase db reset

# Regenerate TypeScript types from local DB
pnpm --filter @baseball/database gen-types

# Deploy edge functions
supabase functions deploy pitch-count-calculator
supabase functions deploy push-notifications
supabase functions deploy maxpreps-export
supabase functions deploy create-team
supabase functions deploy invite-member
```

---

## Architecture

**Monorepo** — Turborepo + pnpm workspaces. TypeScript everywhere.

| Layer | Technology |
|-------|-----------|
| Mobile app | Expo SDK 51 + Expo Router v3 (React Native) |
| Web app | Next.js 14 (App Router) |
| Shared packages | `@baseball/shared`, `@baseball/database`, `@baseball/ui` |
| Backend | Supabase (Postgres + Realtime + Auth + Storage) |
| Offline storage (mobile) | WatermelonDB (SQLite via JSI) |
| Styling (mobile) | NativeWind v4 (Tailwind CSS for React Native) |
| Styling (web) | Tailwind CSS + shadcn/ui |
| Edge functions | Deno (Supabase Functions) |
| Push notifications | Expo Push Notifications |
| Deployment (web) | Vercel |
| Deployment (mobile) | Expo EAS Build |

### Key Architectural Decision: Event Sourcing

`game_events` is an **immutable append-only log**. Every pitch, out, and substitution is a row. Game state (score, count, baserunners) is derived by replaying events. This enables:
- Offline-first sync (events created on device, upserted to Supabase idempotently)
- Full audit trail for pitch count compliance
- Future analytics without schema changes

### RBAC

Roles: `head_coach`, `assistant_coach`, `player`, `parent`, `athletic_director`.
Enforced at three layers: Supabase RLS (primary), edge function JWT verification, client UI gating (cosmetic only).

### Directory Structure

```
baseballcoachesapp/
├── CLAUDE.md
├── .env.example
├── package.json           # Root workspace (turbo, eslint, prettier)
├── turbo.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
│
├── apps/
│   ├── web/               # Next.js 14 — admin dashboard + live score viewer
│   │   └── src/
│   │       ├── app/       # App Router pages
│   │       ├── components/
│   │       └── lib/supabase/
│   └── mobile/            # Expo React Native — offline-first scoring + messaging
│       ├── app/           # Expo Router file-system routing
│       └── src/
│           ├── db/        # WatermelonDB schema + models
│           ├── sync/      # Sync engine (WDB ↔ Supabase)
│           ├── features/  # scoring/, roster/, messaging/
│           ├── lib/       # supabase.ts, notifications.ts, device-id.ts
│           └── providers/ # AuthProvider, SyncProvider
│
├── packages/
│   ├── shared/            # Pure TS: types, constants, Zod schemas, pure utils
│   ├── database/          # Supabase client factory + generated types + query helpers
│   └── ui/                # Shared React Native component primitives
│
└── supabase/
    ├── migrations/        # 12 ordered SQL migration files
    ├── seed.sql
    └── functions/         # Deno edge functions
        ├── pitch-count-calculator/
        ├── push-notifications/
        ├── maxpreps-export/
        ├── create-team/
        └── invite-member/
```

---

## Key Conventions

### Code Style

- Prefer **explicit over implicit** — variable names should describe their purpose
- Keep functions **small and single-purpose**
- Avoid deeply nested logic; extract helpers when nesting exceeds 2-3 levels
- Prefer **early returns** over deeply nested conditionals
- Delete dead code rather than commenting it out

### Naming

| Entity | Convention | Example |
|--------|------------|---------|
| Files | kebab-case | `player-stats.ts` |
| Components | PascalCase | `RosterTable` |
| Functions/variables | camelCase | `getPlayerAverage()` |
| Constants | SCREAMING_SNAKE | `MAX_ROSTER_SIZE` |
| Database tables | snake_case | `player_stats` |
| CSS classes | kebab-case | `roster-card` |

### Testing

- Write tests for all business logic (statistics calculations, validation rules, etc.)
- Prefer unit tests for pure functions; integration tests for API endpoints
- Test files live alongside source files or in a dedicated `tests/` directory
- Use descriptive test names that read like sentences: `"should calculate ERA correctly for relief pitchers"`

### Error Handling

- Never swallow errors silently
- Log errors with enough context to debug (include relevant IDs, inputs, etc.)
- Return meaningful error messages to the client; never expose internal stack traces in production
- Validate all external input at system boundaries (API request bodies, user form input)

### Security

- Never commit secrets, API keys, or credentials — use environment variables
- Store sensitive config in a `.env` file (never committed); document required variables below
- Sanitize and validate all user-provided data before using it in queries or responses
- Follow the principle of least privilege for database access and API permissions

---

## Environment Variables

Copy `.env.example` to `.env.local` in each app directory. Never commit `.env` files.

| Variable | Where | Description |
|----------|-------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | `apps/web/.env.local` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `apps/web/.env.local` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only (never client) | Supabase service role key |
| `EXPO_PUBLIC_SUPABASE_URL` | `apps/mobile/.env.local` | Supabase project URL (mobile) |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | `apps/mobile/.env.local` | Supabase anon key (mobile) |
| `EXPO_ACCESS_TOKEN` | Supabase secrets | Expo push notification API token |
| `APP_URL` | Supabase secrets | Base URL for invite redirect |

---

## Database

- **Never** modify the Supabase schema manually — always use migrations in `supabase/migrations/`
- Migration files use timestamp prefix: `YYYYMMDDHHMMSS_<description>.sql`
- After adding a migration: run `supabase db reset` locally, then `pnpm --filter @baseball/database gen-types` to regenerate TypeScript types
- **Never** UPDATE or DELETE rows in `game_events` — the table is append-only by design
- After changing `supabase/migrations/`, update `packages/database/src/types/supabase.ts` (or regenerate it)

---

## Domain Glossary

Consistent naming helps avoid confusion between the codebase and baseball terminology.

| Term | Meaning |
|------|---------|
| **Coach** | A coaching staff member with app access |
| **Player** | An athlete on a roster |
| **Roster** | A list of players for a team or season |
| **Game** | A single scheduled or completed game |
| **Lineup** | The ordered batting order for a specific game |
| **Stats** | Performance statistics (batting, pitching, fielding) |
| **Drill** | A practice activity in a drill library |
| **Season** | A time period grouping games and rosters |
| **GameEvent** | An atomic timestamped action in a game (pitch, hit, out, sub, etc.) — the event sourcing primitive |
| **PitchCount** | Running total of pitches thrown by a pitcher in a game; tracked for compliance |
| **ComplianceRule** | A ruleset (e.g., NFHS, Little League) defining max pitches per day and required rest days |
| **QAB** | Quality At-Bat — a high-school-relevant metric crediting productive plate appearances regardless of traditional hit/out outcome |
| **Channel** | A messaging context: announcement (coach-post-only), topic (threaded), or direct (1:1) |

Extend this glossary as domain concepts are added to the codebase.

---

## AI Assistant Guidelines

When working on this repository as an AI assistant:

1. **Read before writing** — Always read existing files before modifying them. Understand the context and patterns in use.
2. **Stay in scope** — Only change what is necessary for the task. Avoid refactoring unrelated code.
3. **Match existing conventions** — Follow the naming, formatting, and structure already established in the codebase.
4. **Document as you go** — If you add environment variables, commands, or domain concepts, update this file.
5. **Test coverage** — Add or update tests when modifying business logic.
6. **No secrets** — Never commit credentials, tokens, or passwords.
7. **Ask when uncertain** — If the task is ambiguous or would require a significant architectural decision, surface the ambiguity rather than guessing.
8. **Commit clearly** — Use Conventional Commits format with a descriptive scope and summary.
9. **Branch discipline** — Work on the designated branch; never push directly to `main`.
10. **Keep this file current** — Update CLAUDE.md whenever something significant changes in the project structure, stack, or conventions.
