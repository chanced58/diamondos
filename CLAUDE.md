# CLAUDE.md — Baseball Coaches App

This file provides guidance for AI assistants (Claude and others) working on this repository. Keep it up-to-date as the project evolves.

---

## Project Overview

**baseballcoachesapp** is an application for baseball coaches. Its exact feature set should be documented here as it is defined, but the intent is to provide tooling useful to coaching staff (e.g., roster management, game planning, statistics tracking, drill libraries, player development tracking).

> **Note:** This repository was initialized empty. Update this section as soon as the tech stack, architecture, and feature scope are established.

---

## Repository Status

| Item | Status |
|------|--------|
| Initialized | Yes |
| Source code | Not yet added |
| Tests | Not yet configured |
| CI/CD | Not yet configured |
| Documentation | This file only |

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

> Fill these in once the tech stack is chosen. Examples below are placeholders.

### Install Dependencies
```bash
# e.g., npm install  |  yarn  |  pip install -r requirements.txt  |  go mod download
```

### Run Development Server
```bash
# e.g., npm run dev  |  python manage.py runserver  |  go run ./cmd/server
```

### Run Tests
```bash
# e.g., npm test  |  pytest  |  go test ./...
```

### Build for Production
```bash
# e.g., npm run build  |  docker build .  |  go build ./cmd/server
```

### Lint / Format
```bash
# e.g., npm run lint  |  ruff check .  |  golangci-lint run
```

---

## Architecture

> Document the high-level architecture here once it is established. Include:
> - Frontend framework and major libraries
> - Backend framework and language
> - Database(s) and ORM/query layer
> - External APIs or services (e.g., authentication, storage)
> - Deployment platform (Vercel, AWS, Railway, etc.)

### Directory Structure

> Update once source code is added. A typical structure might look like:

```
baseballcoachesapp/
├── CLAUDE.md              # This file
├── README.md              # User-facing documentation
├── package.json           # (if Node/JS project)
├── src/
│   ├── app/               # Application entry points / routing
│   ├── components/        # Reusable UI components
│   ├── features/          # Feature-specific modules
│   ├── lib/               # Shared utilities and helpers
│   ├── api/               # API route handlers or service layer
│   └── types/             # Shared TypeScript types / interfaces
├── tests/                 # Test files
├── public/                # Static assets
└── docs/                  # Additional documentation
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

> Document all required environment variables here as they are added.

Create a `.env` file in the project root (do not commit it). A `.env.example` file should be committed as a template.

| Variable | Description | Required |
|----------|-------------|----------|
| _(none yet)_ | — | — |

---

## Database

> Document schema conventions, migration tooling, and seeding steps here once chosen.

- Use migrations for all schema changes — never modify the database schema manually
- Migration files should be named with a timestamp prefix: `20240215_add_player_stats_table`
- Seed scripts for local development should live in `db/seeds/` or equivalent

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
