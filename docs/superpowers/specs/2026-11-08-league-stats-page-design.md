# League Stats Page — Design

**Date:** 2026-11-08
**Status:** Approved (2026-11-08)
**Branch:** `feature/league-stats-page`

## Why

The public league home page (`/l/[slug]`) shows standings and top-10 leader boards, but
there is no way to see *every* player's numbers. The main visitor is a **player checking
their own stats** who wants to know **where they rank against their own teammates and
against the whole league**. A top-10 board can't answer that for most players.

Success: a player opens the page (most likely on a phone, right after a game — *our
assumption*), finds themselves in seconds, and sees their league rank and team rank for
the stats they care about.

## Goals

- A new page at **`/l/[slug]/stats`** listing every player in the league for a season, with
  full batting and pitching lines, plus a Teams tab with every team's season numbers.
- Every column is sortable; rank follows the sorted column. Each row shows **league rank**
  and **team rank** for that column.
- Two views of the same page (user's decision):
  - **Signed-in player → "Your ranks" card on top** (mockup B), then the table with their
    row highlighted.
  - **Public / no sign-in → table only** (mockup A) with team filter, name search and a
    "Qualified only" switch.
- Link to the page from the league home page.

## Non-goals

- No new database tables, columns, migrations or RPCs. Read the existing snapshot tables
  (`league_player_stat_snapshot`, `league_team_stat_snapshot`, `league_standings_snapshot`).
- No individual public player pages.
- No historical/rank-movement (▲▼) data — none is retained.
- No changes to how snapshots are computed.

## Anti-goals (would make this a failure even if it works)

- Leaking anything a public viewer must not see: full names, or the stats/ranks of a player
  who opted out of public stats. Opted-out values must be stripped **on the server** and
  never reach the client payload.
- Ranks that disagree with the home-page leader boards for the same stat/season (same
  qualifier minimums, same sort direction, same tie-handling).
- A table that's unusable on a phone.

## Who sees what

| Viewer | Names | Opted-out players | "Your ranks" card | Highlight |
|---|---|---|---|---|
| Public (not signed in) | "First L." | **Excluded entirely** *(our call — matches leader boards; team pages show them with "—" but ranking is this page's point)* | None | None |
| Signed in, linked to a player (`players.user_id = auth.uid()`) in this league/season | Full | Included | **Yes**, for that player | Their row |
| Signed in parent (`parent_player_links.parent_user_id = auth.uid()`) of a player in this league/season | Full | Included | **Yes**, for the linked player; a small switcher if more than one *(our call)* | That player's row |
| Signed in, a player *and* a parent | Full | Included | Own player record first in the switcher *(our call)* | Selected player's row |
| Any other signed-in user (coach, admin, etc.) | Full | Included | None | Rows of their active team (same "your team" rule as the home page) *(our call)* |

"Signed in" alone does not change league visibility rules: a `signed_in`-only league still
shows the same sign-in prompt the home page shows to logged-out visitors.

## Page layout

Order, top to bottom:

1. **Header** — league name (links back to `/l/[slug]`), "League Stats" title, season
   switcher (same behaviour as the home page: `?season=`, newest first, hidden when only
   one season). Respect the league's color scheme class like the home and team pages do.
2. **"Your ranks" card** — signed-in player/parent view only (see below).
3. **Tab bar** — Batting · Pitching · Teams. Tab is reflected in the URL (`?tab=`) so a
   shared link opens the same tab *(our call)*. Default Batting.
4. **Filter bar** (Batting/Pitching) — Team filter (All / each team), name search,
   "Qualified only" switch (default **on**).
5. **Table.**

### Tables

**Batting** columns (reuse `TEAM_BATTING_KEYS` from the team page):
Lg # · Team # · Player · Team · PA · AVG · OBP · SLG · OPS · HR · RBI · H · R · 2B · 3B · BB · QAB% · Hard-Hit%.
Default sort: AVG (desc). Players with 0 PA are not listed on this tab.

**Pitching** columns (reuse `TEAM_PITCHING_KEYS` + IP lead column):
Lg # · Team # · Player · Team · IP · ERA · WHIP · K.
Default sort: ERA (asc — lower is better). Players with 0 IP are not listed on this tab.

**Teams** columns: # · Team · W-L-T · PCT · then each team stat in the catalog
(Team AVG, Team ERA, Runs Scored, Run Diff). Default sort: PCT. Platform teams only
(standings rows with a `team_id`); team names link to `/l/[slug]/team/[teamId]`. No filters
on this tab.

Team names in the player tables link to the team page, as elsewhere.

### Ranking rules

- **Rank column = rank by the currently sorted stat**, best-first per the stat's natural
  `sortDir`, regardless of which way the user toggled the arrow.
- **League rank** ranks among all eligible players in the league; **team rank** among
  eligible players on the same team. Both are computed over the *unfiltered* set — the team
  filter and search narrow what's shown, never what a rank means.
- **Qualification:** for rate stats (`isRate` with `qualifier` `pa`/`ip`), only players at or
  above the league's minimum are ranked, using the **same** `leaderQualifierMinimums(...)`
  inputs the home page uses (league games played, `leader_config.qualifierOverrides`,
  league level). Counting stats rank everyone with a value. PA/IP columns rank everyone.
- **Qualified only on:** unqualified players are hidden (for rate-stat sorts).
  **Off:** they're shown below the ranked players with "—" in the rank columns and a muted
  style.
- **Who is eligible to be ranked for a stat** *(our call)*: batting stats (and PA) only rank
  players with PA > 0; pitching stats (and IP) only rank players with IP > 0 — even when the
  qualifier minimum is 0. The "of N" in "#3 of 41" is the number of players eligible for
  that stat.
- **Ties** share a rank (standard competition ranking: 1, 2, 2, 4), displayed in name order.
- **One shared ranking function** *(our call)*: add a pure eligibility-and-ranking function to
  `packages/shared/src/utils/league-leaderboard.ts`, unit-tested, used by the card, the table,
  **and the home page** — re-implement `buildLeaderboard` on top of it so the two pages can't
  drift. This deliberately changes these home-page behaviours:
  - non-pitchers (0 IP) no longer appear on ERA/WHIP boards when the IP minimum is 0
    (early season, or `qualifierOverrides.ipPerGame: 0`);
  - ties get a stable name order instead of database row order;
  - players with 0 PA but R > 0 (courtesy / pinch runners) no longer appear on the Runs
    board, because the shared `activity` rule requires PA > 0 for batting stats;
  - the mobile app's league home (which calls `getLeagueHomeData`) changes the same way;
  - the team page's hero rank breaks win-pct ties by team name.
  The home-page change is in scope for this branch.

### The viewer's own row is never hidden *(our call)*

- The "Qualified only" switch never hides the signed-in viewer's own player row (or the
  card's selected player). Unqualified, it shows muted with "—" in the rank columns.
  The team filter still applies (if they filter to another team, their row goes away).
- **Search ignores the "Qualified only" switch**: typing a name shows every matching player,
  unqualified ones muted and unranked. This is how a public player finds themselves.

### "Your ranks" card

- Shows the player's name, team, and four headline stats for the active tab, each with
  value, **league rank** ("#3 of 41") and **team rank** ("#2 on Hawks").
  - Batting: AVG, OBP, HR, RBI. Pitching: ERA, WHIP, K, IP. Teams tab: the card shows the
    player's *team* line (record, league standing) instead *(our call)*.
- If the player isn't qualified for a rate stat: show the value and "Needs N more PA" /
  "Needs N more IP" instead of a rank.
- If the player has no batting (or pitching) line this season, the card says so in one
  line instead of four empty boxes.
- If the linked player isn't in this league/season, no card is shown.
- Clicking the card scrolls to and highlights their row in the table *(nice-to-have)*.

## Leagues that hide their leader boards (user's decision: "stats, no ranks")

League admins can switch off home-page sections via `home_theme.sections`. When the
**`leaders`** section is disabled, the league has chosen not to rank its players publicly, so
the stats page shows **stats without ranks**:

- The page still lists every player's numbers, sortable, with team filter and search.
- **No Lg # / Team # columns**, and no rank anywhere in the "Your ranks" card — it shows the
  player's values only (and is titled "Your stats"). No "Needs N more PA" hints.
- The "Qualified only" switch is hidden; all players with a line are listed.
- Applies to every viewer, signed in or not.
- *(Our call)* The Teams tab's # column follows the **`standings`** toggle the same way:
  hidden when standings are off. Team stats still show.
- The rule is decided in the loader (a single `rankingEnabled` flag), and when it's off the
  loader returns no rank data at all — ranks are not just hidden in the UI.

## Getting there (links)

- League home page: a **"Full league stats →"** link in the League Leaders section header
  and under the Standings table. Both carry the current `season`.
- *(Our call)* Because those sections can be switched off, the home page also gets a small
  always-rendered footer link ("League stats") that doesn't depend on any section toggle.
- Team page: a "League stats" link back in the hero/header area *(our call; small)*.

## Mobile

- Phone-first *(our assumption)*. Table scrolls horizontally; the rank and Player columns
  stay **sticky** on the left so a player can scroll stats without losing their name.
- Filter bar wraps; the card's four stats sit in a 2×2 grid under ~480px.

## Data & privacy constraints

- All data is read server-side with the service-role client (as `load.ts` / `team-load.ts`
  do), so **every privacy rule is enforced in the loader**, not the component:
  - public viewers: drop opted-out rows before they leave the server; mask names with
    `publicDisplayName`.
  - signed-in viewers: `memberDisplayName`.
- Identifying "you": resolve the viewer's player ids from `players.user_id` and
  `parent_player_links`, then intersect with the season's `league_player_stat_snapshot`
  rows for this league. Only ever use ids found in this league's snapshot.
- Read the season list, visibility and `leader_config` the same way the home page does;
  prefer extracting shared helpers from `load.ts` over copying them.
- Metadata: title "`<League>` — League Stats", `noindex` for `signed_in` leagues, same rules
  as the home page.

## Left to the builder

- Component structure, whether sorting/filtering is client-side (expected — a league's
  roster is small) and how state is held.
- Whether to generalise the team page's `SortablePlayerTable` or build a sibling.
- Exact empty-state copy, styling details within the existing design tokens.
- Test layout, following the existing `lib/league-home/__tests__` pattern (Jest).
