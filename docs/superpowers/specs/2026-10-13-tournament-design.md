# Tournament creation — accepted design

Status: implemented on `feature/tournament`. See [verification and remaining acceptance checks](../../tournament-verification.md).

## Requested outcome

A user with an explicit **tournament mode** permission can start a new tournament, select a current team they administer or choose **Create Tournament Team**, and specify whether more than nine batters and mid-game lineup expansion/contraction are allowed.

## Scope and assumptions for review

The first release creates a team-centered tournament workspace, schedules its games, and enforces its lineup rules in web and mobile scoring. The data model permits additional participating teams later. Implementation follows the authorized team-centered first-release plan.

Bracket generation, seeding, registration, payments, public tournament pages, and automatic advancement are outside this first release. Tournament creation starts online; previously downloaded tournament games remain scoreable offline.

Accepted definition of team administrator: an active `head_coach` or `athletic_director` membership. Assistant coaches retain existing scoring privileges but cannot select a team for tournament creation without an explicit future grant. Platform administrators may administer permission grants, but tournament creation still requires the tournament mode grant and team eligibility.

## Existing code and alternatives

The repository already has `leagues.league_type = 'tournament'`, league scoring settings, expanded orders capped at 30, and a `LINEUP_EXTENSION` substitution type. It does not have a tournament instance model, a tournament mode permission, or lineup contraction.

Recommended: dedicated tournament records linked to existing teams and games. This keeps one team's regular league rules intact and supports overlapping tournament participation. Treating each tournament as a league would reuse administration but would conflict with the current first-active-league settings lookup. A games-only tag would be cheaper but would leave ownership, permission, lifecycle, and rules without a coherent boundary.

## Permission and ownership

> **Superseded 2026-10-16** (`20261016000001_open_tournament_creation_to_coaches.sql`): the per-user tournament mode grant was removed. Any signed-in user may create a tournament with **Create Tournament Team**; attaching an existing team still requires an active head coach or athletic director membership. The column, grant RPC and audit table remain only as history; nothing reads the flag. The paragraphs below describe the original design.

Add `user_profiles.tournament_mode_enabled`, default false. Only platform-admin-controlled server/database operations may grant or revoke it; a user must not be able to set their own permission through profile updates. Audit grant changes with actor, target, timestamp, and old/new values using a dedicated permission audit table.

Check the authenticated identity, grant, and active team-admin membership on every creation attempt, including inside the database transaction. Hide the creation entry point when unauthorized, but enforce it through RLS and RPC authorization. Revocation prevents new tournament creation; existing tournament access continues to follow ownership and team membership so scheduled games are not stranded. Revocation is not an automatic removal from existing teams.

## Data model and creation transaction

Add `tournaments` with ID, name, creator, status (`draft`, `active`, `completed`, `archived`), dates, validated scoring settings, and an idempotency request ID scoped to creator. Add `tournament_teams` with a unique tournament/team pair, a tournament-specific season ID, and `is_tournament_only`. Add nullable `games.tournament_id` plus a relational constraint ensuring the game's team and season are registered for that tournament. Retain the existing required `games.season_id`.

Use a separate season for tournament games even when selecting an existing team, without changing its active regular season. This separates tournament results from regular-season statistics; pitch-rest compliance must still consider all relevant games across seasons. Aggregate/public league loaders must explicitly exclude tournament games from regular-league results unless the product later opts in.

Expose a narrow authenticated creation RPC. In one transaction it checks permission and team eligibility, creates the tournament, creates or attaches the team, creates its season, registers the participant, and returns `{ tournamentId, teamId, seasonId }`. For **Create Tournament Team**, also create the caller's head-coach membership, Announcements channel, and posting membership. Keep the team after the tournament ends; archive the tournament rather than deleting historical events. Do not automatically copy players, transfer memberships, or change the existing team's league.

Use a fixed `search_path`, qualified objects, restricted EXECUTE grants, and explicit actor checks if the RPC needs `SECURITY DEFINER`. Retry with the same request ID returns the original result without duplicate teams. A failed transaction leaves no orphan team, season, tournament, or channel. General team/game write paths must not allow clients to bypass the tournament permission or participant constraints.

## Creation flow

1. **New Tournament**: name and required start/end dates, with end on or after start.
2. **Choose team**: show all eligible active memberships, independently of the current active-team selection, and the exact option **Create Tournament Team**. The new-team branch asks for team name and existing optional organization/state fields.
3. **Lineup rules**: explicitly answer **Allow more than 9 batters?** and **Allow lineup expansion/contraction during games?** Both default No for a new tournament and remain independent. Expanded lineups use a configurable cap of 10–30; otherwise the cap is 9. Mid-game changes can still be allowed for an order below the cap when expanded lineups are disabled.
4. **Review and create**: show team and rules, disable duplicate submission, preserve entries after recoverable errors, and redirect to the tournament workspace with roster and Add Game actions.

No automatic player import is implied by creating a tournament team. Existing roster management can populate it. Starting an instance creates a draft workspace; scheduling and starting games follow the existing game lifecycle.

## Rule resolution and scoring

Tournament games resolve tournament settings; regular games resolve current league settings and platform defaults. Update callers that currently resolve by team, including both lineup builders, opponent actions, guest actions, web scoring, and mobile scoring. Never write the tournament choices to the selected team's league.

Reuse the settings shape but add `lineup.allowMidGameContraction`, default false when reading legacy settings. Tournament creation writes both extension and contraction flags from its mid-game-change answer. Replace the current helper's unconditional expanded-lineup prerequisite for tournament games with checks against the actual cap. Preserve existing regular-game behavior through explicit compatibility tests.

Capture effective settings on a game when play starts and keep them fixed for that game's replay. Tournament settings changes apply only to games not yet started. Missing or unreadable tournament settings must prevent starting or changing a lineup rather than silently using the permissive league defaults. Store downloaded settings by game ID/version for mobile; an uncached tournament game must load them online before offline scoring.

Add `LINEUP_CONTRACTION` as an append-only `SUBSTITUTION` variant. The accepted first-release policy removes a batting slot without an automatic out, keeps the remaining order stable, and never removes existing player statistics. Competition-specific automatic-out policies remain outside this implementation.

For this policy, allow a reduction down to one occupied batting slot, reject removing the current batter during an active plate appearance or a runner still on base, and apply changes between plate appearances. Ordinary replacements stay substitutions rather than contraction. Replay must track the next batter by stable slot/player identity at each event boundary, rather than only taking total plate appearances modulo the new lineup length. Contraction, expansion, voiding, undo, reload, and offline sync must agree on the next batter for both sides.

Enforce lineup rule checks at the database ingestion boundary as well as server actions and UI. Serialize each game's lineup-changing writes so concurrent additions cannot exceed the cap. Do not UPDATE or DELETE `game_events`; any lineup projection must be reproducible from original lineup plus effective events and their voids.

## Acceptance and verification

- Unauthorized users cannot create via UI, direct RPC, forged team ID, or profile self-escalation.
- Eligible users can use each creation branch; retries create one complete instance and failures roll back all rows.
- Selecting a current team leaves its roster, active regular season, league membership, and league scoring rules intact.
- Both questions are persisted; initial caps and every in-game change use the game's tournament rules on web/mobile.
- A regular game and a tournament game for the same team can have different rules without cache leakage.
- Contraction never erases prior at-bats, changes score/pitch count, or selects the wrong next batter after replay/undo/sync.
- Historical/public league results and pitch-rest compliance are verified across tournament and regular seasons.

Implement with unit, database authorization/transaction, server action, and offline replay tests. Regenerate database types after migrations, run type checks/lint/build, run CodeRabbit review, and commit each discrete unit. Production schema deployment and PR merge require separate authorization.
