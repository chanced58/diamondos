# Shared League Game — Design

Date: 2026-11-09
Status: Draft for review
Project 1 of 3 for adult-league support (2 = schedule generator and editor, 3 = QR lineup handoff).

## Why

DiamondOS should be able to run an adult league end to end: a public league home, standings, leaders, a full stats page and team pages, all fed by the scorekeeper. The pages exist, but scored games don't reach them correctly. Today:

- A game between two league teams is not one game. Each team owns its own copy, the other side is a typed name or an opponent record, and the New Game picker doesn't even offer member teams.
- In the usual adult-league night, one dugout scores. The other team's win/loss then never reaches the standings, and the other team's players get no stats: their at-bats are logged against unlinked `opponent_players` rows, not their real `players` rows.
- Dual scorekeeping can't fill the gap: `provisionMirrorGame` needs `opponent_teams.linked_team_id`, and nothing in the app ever sets it.
- Teams created by the league setup wizard are league-owned `opponent_teams`. Nobody can sign in to them, they can never record a game, and there is no way to convert them into real teams. A wizard-only league shows an empty page.
- League standings count every completed non-tournament game of a member team, including scrimmages against outside teams, and credit a player's season stats to whatever team they are on *now* (a trade moves past stats; a release deletes them from the league).

This project makes a league game one shared thing that either side can score, and makes one scorebook count for both teams.

## How a league night actually works (from the league organizer)

- League admins set the schedule. If both coaches agree, a game can be rescheduled.
- Usually there is a single scorekeeper. The device (phone or iPad) is signed in as a coach or scorekeeper, but whoever is free in the dugout — often a player sitting out — physically taps through the game. Who holds it doesn't matter; the signed-in account does.
- Lineups for the other team are almost always entered at the field.
- Cell service at fields is unreliable. Anything needed at the field must work offline.
- Sometimes both dugouts score the same game. When that happens, once the devices sync, both coaches get a discrepancy report, and the home team is responsible for working it out with the other coach and entering the final result.
- Some teams will never use the app. Their details may need to be entered after the game, by either the league admin or the coach who scored it.
- The league hasn't started. All current data in the app is test data; nothing needs to be carried over or preserved.

## Goals

1. A league game is created by the league between two league teams (home and away) and appears on both teams' schedules and devices.
2. Any coach or scorekeeper of either team can score it, online or offline, without coordinating in advance.
3. When one side scores, that one book counts for both teams' standings and both teams' players' stats.
4. When both sides score, both coaches are told about the differences once both books sync; the home team settles them and the league uses the settled result.
5. Every team in a league is a real team, whether or not anyone on it uses the app. Teams that don't use the app have league-kept rosters, standings rows and team pages.
6. The scorer builds the other team's lineup at the field by tapping names from that team's real roster, offline. If a player isn't on the roster, the scorer records what they know (jersey number or batting slot) and keeps going.
7. Unknown players recorded during a game can be matched to real players (or added to the roster) after the game by the coach who scored it or a league admin; their stats from that game then count for that player.
8. Only league games count toward league standings and leaderboards.
9. A player's league stats are credited to the team they played for in that game, not the team they're on today.
10. A league game nobody scored on the app can still count: an admin or coach enters a final score, a box score, simple batting stats, or a forfeit afterward.

## Non-goals (this project)

- The schedule generator and its editor, and the "both coaches agree" reschedule flow (project 2). This project only needs admins to add, edit and cancel a single league game by hand.
- Phone-to-phone QR lineup handoff (project 3). This project must leave room for it: a lineup for one side of a league game must be something a second device can produce and the scoring device can accept.
- General refresh hardening from the gap analysis (scheduling the snapshot cron on Render, checking snapshot write errors, transactional rebuilds, refreshing after transfers/opt-outs/division changes). Only the refresh triggers this project's own new actions need are in scope.
- Adult stat coverage (innings-aware ERA, pitcher W/L/SV, more columns), announcements on the public page, public schedule/box scores, player pages. Separate projects.
- Migrating existing data. All of it is test data.

## Anti-goals (would make this a failure even if it technically works)

- The scorer has to stop the game to fix the other team's roster, or can't score at all because a roster is incomplete or the phone is offline.
- The scorer has to know or care which team "owns" the game, or switch accounts to score for the other side.
- A team's standings or players' stats depend on whether *that* team used the app that night.
- Matching a player after the game requires editing or deleting `game_events` (the log is append-only by design).
- Two books on one game silently produce two different results in the standings.

## Design

### 0. Which leagues this applies to

Everything below applies to leagues that schedule their own games — a per-league setting ("the league schedules games"), on by default for leagues of type `adult` and off for every existing league. Leagues with the setting off keep today's behavior unchanged: team-created games count, league-owned opponent teams still work, and no rosters are shared across teams. This keeps high school and youth leagues, where teams often schedule their own conference games and rosters are of minors, out of this change. *(My call.)*

### 1. Every league team is a real team

League setup and league admin "create team" make real `teams` rows (league-managed, possibly with no members), with rosters as real `players` rows, instead of league-owned `opponent_teams`. A league-managed team:

- appears in standings, has a team page, and has a roster the league admin (and any later coach of the team) maintains;
- has no signed-in members until someone is invited; inviting a coach to it turns it into an ordinary app team, keeping its history (it's the same `teams` row).

League-owned `opponent_teams` as league members (`league_members.opponent_team_id`) stop being part of league play. Because there is no data to preserve, the builder may remove or ignore that path for leagues rather than migrate it. *(Builder's call how far to clean up; my call that it no longer counts toward league standings.)*

### 2. The league game

A **league game** is a league-owned record: league, season, home team, away team, scheduled time and zone, venue/field, status. It is the thing the league schedules, reschedules, cancels and counts. The existing `league_schedule_slots` table (home/away team, `home_game_id`, `away_game_id`) was designed for this and is the suggested home for it; the builder may reshape or replace it, since nothing reads it today.

When a league game is created, each team gets its own `games` row (`team_id` = that team), paired to the other (`paired_game_id`, `scorer_side`), with `opponent_team_id` pointing at the league roster record for the other team (section 4). Keeping per-team rows is a deliberate call (mine): every team-scoped surface — RLS, scoring, the mobile sync pull, schedules, RSVPs, lineups, live viewing — already keys off `games.team_id`, so both teams get a working game on their schedule and device without rewriting those paths. This follows the existing intent in `20260801000004_league_schedule_engine.sql` ("team-owned games remain the source of truth; published slots reference the paired game rows").

Edits to a league game (time, venue, cancel) are made on the league game and applied to both rows. For this project, league admins create, edit and cancel league games by hand; teams cannot create games that count as league games. A team can still create its own games (scrimmages, non-league opponents), and those never count, even against another league team.

The `dualScorekeeper` league toggle no longer gates anything for league games: either side may always score. *(My call.)*

### 3. Who can score

Any coach or scorekeeper of either team scores the game from their own team's row, exactly as they score any game today, online or offline. League admins can also score a league game (for a game neither team scores on the app), **on the web only**, from the home team's row; this needs a scoring permission for league staff on league game rows, since `game_events` RLS today requires team membership. Offline admin scoring on mobile is out of scope: the mobile sync pull and team list key off `team_members`. *(My call; the organizer didn't object to admins scoring.)*

### 4. The other team's roster on the scoring device

The scorer's book records the other team's players through the existing opponent path (`opponentBatterId` / `opponentPitcherId` → `opponent_players`), which the mobile app already mirrors and lets the scorer edit offline (`OpponentPlayerSheet`, `opponent-lineup`). For league play, that opponent roster must be a linked mirror of the other team's real roster:

- each league team has a league-level opponent record linked to it (`opponent_teams.linked_team_id`), whose `opponent_players` are kept in step with the team's `players`, each carrying a link to its real player (new, e.g. `opponent_players.linked_player_id`);
- both teams' league game rows point at these records, so the existing mobile sync brings the other team's roster onto the device whenever it has signal, ahead of game night.

This is the "cross-roster player-identity bridge" that `CLAUDE.md` notes per-player reconciliation is waiting for. The builder may choose a different bridge as long as: the device has the other team's roster offline; every player in a book resolves to a real league player or to an unmatched placeholder; and matching never touches `game_events`.

### 5. Lineups at the field

The scorer builds the other team's batting order by tapping names from that roster. If a player isn't there, the scorer adds them on the spot with whatever is known (a name, a jersey number, or nothing beyond the batting slot). That creates an **unmatched placeholder** on the other team's league roster record (an `opponent_players` row with no real-player link), so scoring never stops. The same path covers the other team's fill-in who is on no roster at all. *(My calls below.)*

- A placeholder belongs to the game it was created in: it is hidden from the roster picker in other games, so "#12, unknown" from one night doesn't clutter the next.
- Coaches and scorekeepers of either team in a league game may create placeholders on the other team's league roster record, offline, for that game. This is a new write permission (today only the owning team's coaches write `opponent_players`) and must be limited to placeholders tied to a league game the writer's team is in.
- After the game a placeholder is either matched to a real player, added to the roster as a new player, or marked as a fill-in (not on the roster); a fill-in's plays count in team totals only, like an unmatched placeholder.
Fill-in players on the scorer's own team work as guests do today.

Any lineup for one side of a league game must be representable as a self-contained list (player references, batting order, positions, jersey numbers) that a second device could produce and the scoring device could accept offline. Project 3 builds the QR handoff on this; this project doesn't build the handoff but shouldn't make it hard.

### 6. One book counts for both teams

For each completed league game, the league resolves a single **result book**:

- only one side scored → that side's book;
- both sides scored → the home book with the home team's settled overrides (section 7);
- neither side scored → the hand-entered result, if any (section 6a); otherwise the game doesn't count yet.

From the result book, the league derives:

- **The result:** home and away runs, applied to both teams' standings from the league game's home/away teams, not from each team's own `games` row scores.
- **Player stats, for both teams:** the scoring team's players via `batterId`/`pitcherId`; the other team's players via the bridge (`opponent_players` → real player). Each player is credited to the team they played for in that game, so trades and releases don't move or delete past stats. A player who played for two teams in a season has a line per team on each team's page, and one combined season line on league leaderboards and the league stats page, shown with their most recent team. This means the player snapshot is keyed per player and team, not per player. *(My call.)*
- **Unmatched placeholders:** their plays count in the team's totals (team stats, runs, standings) but they appear on no player leaderboard until matched. *(My call.)*

The team that didn't score should still see the game as final, with the score, on its own schedule and game page. Its in-app team stats should include the game too. The builder chooses how (resolving the result book at read time in the shared stat loaders, or writing the result onto the paired row); whatever the choice, `game_events` stays append-only and the league pages read the resolved result. *(Requirement theirs; mechanism the builder's.)*

### 6a. Games nobody scored: hand-entered results

Sometimes nobody scores a league game pitch by pitch: two teams that don't use the app, a forfeit, or both dugouts forgetting. The organizer wants all of these options for entering the result afterward:

- **Final score only.** Counts in standings (W/L/T, runs for and against). No player stats.
- **Box score.** Runs per inning, plus team hits and errors. Counts in standings and team totals. No player stats.
- **Simple batting stats.** The box score plus a batting line per player for both teams (AB, R, H, 2B, 3B, HR, RBI, BB, SO, HBP, SF, SB — the builder may trim to what the stat catalog uses). These count toward players' league batting stats and leaderboards. Players are picked from each team's roster, with the same add-new-player path as matching (section 8). No pitching lines. *(Organizer: batting only.)*
- **Forfeit.** The winning team is marked; it counts as a win and a loss in the standings, with no runs added to either team's runs for or against. *(My call on the runs.)*

Rules *(my calls)*:
- Hand entry is offered only on a league game where neither team's book has any events. A game that was scored, even partly, goes through the scored path and reconciliation instead.
- League admins and coaches of either team can enter or edit it. The home team's coach and league admins can change a result someone else entered; a league admin's entry is final.
- Hand-entered results are stored as their own kind of result (not as synthetic `game_events`), and the league aggregation merges them with event-derived stats. Rate stats that need pitch-level data (QAB%, hard-hit%) leave hand-entered games out of their numerator and denominator; counting and AVG/OBP/SLG-type stats include them.
- Entering or editing a hand-entered result triggers the league stats refresh.
- Web first; mobile through an `/api/m/v1` route over the same service, online only.

### 7. Two books on the same game

Both rows are already paired, so the existing reconciliation (`runReconciliationForGame`, `reconcileScoreLogs`, `game_reconciliations`, `ReconciliationPanel`) applies. Changes:

- It runs once both books have synced and completed, and **both** teams' coaches are notified that there is a discrepancy report: a push notification, plus a banner on the game page and the dashboard until it's settled. No new notification inbox. *(My call.)*
- The home team's coach settles each difference with the other coach and enters the final result. If the home team has no one on the app, the away coach or a league admin settles it instead. *(My call.)*
- Settling is a choice per difference of which book is right; the home book is the default. Line-score differences (runs per half inning, final score, hits, errors) decide the result. Per-player differences take that player's whole line from the chosen book. No hand-typed stat lines. *(My call.)*
- The league uses the settled result for standings and stats, so the two books can never both count. Until it's settled, the home book counts. *(My call.)*
- Reconciliation should cover per-player batting and pitching differences now that the bridge exists (the util already supports it).

### 8. Matching unknown players after the game

On a completed league game, the coach(es) of the team that scored it and league admins can see the other team's unmatched placeholders and, for each one, either match it to an existing player on that team's roster or add a new player to that roster from it. Coaches of the team the placeholder played for can also match their own team's placeholders. *(My call, extending "either the league admin or the coach who scored it".)* League admins also get a league-wide list of unmatched placeholders so nothing is forgotten.

Matching only sets the placeholder's link to a real player. The player's stats from every game that placeholder appeared in then count for them. Matching triggers a league stats refresh for the affected season.

### 9. League pages

- Standings, counters and leaders come from league games only, via the result book. Team-created games never count. The "both teams record each game, so divide by two" game counter goes away.
- "Around the League" recent results and upcoming games come from league games: one row per game, both teams named and linked, current season only.
- League-managed teams get team pages like any other team; their players appear on leaderboards.
- The league stats refresh runs when a league game is completed, when a two-book difference is settled, when a placeholder is matched, and when an admin edits or cancels a completed league game.

## Constraints

- `game_events` is append-only. Nothing in this project updates or deletes event rows; matching and settling work through links and overrides.
- RLS is the primary authorization. New permissions (league staff scoring league games, coaches reading the other team's league roster record, matching placeholders) are enforced in RLS or in services under `lib/services/`, never only in the UI.
- Mobile follows the DataAccessRule: scoring and lineups stay offline-first through WatermelonDB; matching and settling can be online-only `/api/m/v1` routes over shared services. Any WatermelonDB schema change bumps the version with a matching migration step.
- Migrations follow the repo conventions (timestamped files, regenerated types). There is one Supabase environment (prod); apply under the existing SHAKEDOWN protocol, confirming the target first.
- Tests for the pure parts: result-book selection, cross-team attribution, placeholder handling in team totals vs leaderboards, standings from league games only.

## Left to the builder

- Whether the league game lives in a reshaped `league_schedule_slots` or a new table, and its exact columns.
- The bridge's exact shape (column vs link table) and how the league roster mirror is kept in step with `players` (trigger vs service).
- How the non-scoring team's own views get the result (read-time resolution vs writing to the paired row).
- How far to remove the old league-owned `opponent_teams` membership path.
- UI placement of the admin "add league game" form, the matching screen and the league-wide unmatched list, on web and mobile, following existing patterns.

## Out of scope, noted for later

- Project 2: schedule generator and editor; reschedule when both coaches agree.
- Project 3: QR lineup handoff, phone to phone, offline.
- Refresh hardening: the snapshot cron is only scheduled in `apps/web/vercel.json` while hosting is Render; snapshot writes don't check errors; rebuilds aren't transactional.
- Adult stats: ERA, K/7 and BB/7 are hard-coded per 7 innings; no pitcher decisions; thin stat columns.
- Public announcements, public schedule/box scores, player pages.
