# iOS Phase 3 — Findings Ledger

**Device:** iPad Pro 11-inch (M5), iOS 26.5 (`470FA5DE-B47C-4CA5-BB02-F1837E344141`)
**Data:** `diamondos-prod` (`ktxjbjfwrmquohipimjn`) under the shakedown protocol
**Spec:** [design](2026-09-19-ios-phase-3-ui-and-scorekeeping-audit-design.md) · **Plan:** [plan](../plans/2026-09-19-ios-phase-3-ui-and-scorekeeping.md)

IDs continue phase 2's scheme: `S` severe, `H` high, `M` medium.

## Baseline

Gate state at commit `e4f8c02`, before any phase 3 code change:

- `pnpm type-check` — **green.** 5 tasks successful, 5 total.
- `pnpm test` — **green.** Mobile 17 suites / 152 tests; web 8 suites / 62 tests; shared suite passing.
- `pnpm lint` — **RED, inherited.** `@baseball/shared` reports 28 problems (15 errors, 13 warnings) across
  `src/utils/{batting-stats,game-history,game-state,opponent-batting-stats,pitching-stats}.ts`:
  mostly `no-inner-declarations`, plus unused `TERMINAL_EVENT_TYPES` and `BALLS_FOR_WALK`.
  **Not caused by phase 3** — this branch was docs-only when measured. Phase 3's exit gate is
  therefore "no worse than this baseline", not "green". Cleanup is tracked as separate work
  outside this branch.

## Harness notes

Conditions that shape how findings were gathered. Recorded so the evidence's limits are visible.

1. **`inspect` (accessibility tree) is unavailable in this session.** The plan assumed it for
   asserting screen contents and measuring tap-target frames. Substitute: `screenshot` plus `zoom`
   with coordinate math against the known 834×1210 point space. Consequence: tap-target
   measurements are derived from pixels rather than reported frames, so sub-44pt findings carry a
   margin of error and any borderline case is checked in the source rather than logged from
   measurement alone.

2. **Portrait was initially blocked, then unblocked by the owner.** The simulator control tool has
   no rotate action and `xcrun simctl ui` exposes only appearance / contrast / content_size, so the
   first pass covered landscape only. The owner then rotated the device by hand and the portrait
   pass was completed. All 13 routes are now swept in both orientations except sign-in, which
   cannot be reached while the session is authenticated (see M1/M5).

3. **Screenshots and taps share one frame, rotated 90° from upright.** The capture frame is
   834×1210 with origin top-left, and taps land where the screenshot shows them — verified
   empirically by tapping the sign-in email field at (420, 605) and observing focus plus keyboard.
   **The upright view is the screenshot rotated 90° clockwise:** image-left is true-top,
   image-top is true-right, image-right is true-bottom, image-bottom is true-left. Every layout
   judgement below applies that transform. Stated once here rather than repeated per finding.

4. **Metro's HMR entry-point registration fails** with `Unable to resolve module
   .../expo-router/entry` from `HmrServer._registerEntryPoint`. The initial bundle builds and the
   app runs, so this is a developer-experience problem, not a coach-facing one — it fails the
   defect bar and is not logged as a finding. Practical effect on this sweep: fast refresh is
   unreliable, so fixes are verified against full rebuilds.

5. **A stale simulator binary initially showed `requireNativeComponent: "RNSVGRect" was not found
   in the UIManager`.** Resolved by the `expo run:ios` rebuild — `react-native-svg` is a native
   module, as CLAUDE.md warns. Not a defect; recorded so the symptom is not re-investigated.

6. **The app declares portrait-only but iPad permits all four orientations.** `app.json` sets
   `orientation: "portrait"`, and the generated `Info.plist` carries
   `UISupportedInterfaceOrientations` = Portrait/PortraitUpsideDown for iPhone but
   `UISupportedInterfaceOrientations~ipad` = Portrait/PortraitUpsideDown/LandscapeLeft/LandscapeRight.
   So every iPad screen has a landscape layout that the app's own configuration implies should not
   exist, and which nothing has designed for. This is a **suspected common cause** for landscape
   layout findings rather than a finding itself; if the sweep produces a cluster of
   landscape-only defects, the cheapest fix is likely here rather than per-screen.

## Shakedown rows created

| Game id | opponent_name | Created | Torn down |
|---------|---------------|---------|-----------|
| `842151c0-…eab3b82` | SHAKEDOWN phase2 - do not use | 2026-09-10 (phase 2) | 2026-09-19, owner-authorised |
| `f47a3db4-5820-4587-a6c7-6fea2edebdcd` | SHAKEDOWN 2026-09-21 regression | 2026-09-21, phase 3 Task 11 | 2026-09-21, verified clean |

**Pre-flight census was NOT clean.** Task 2 found phase 2 residue live in prod:
`842151c0-b385-4ae6-adc5-d297aeab3b82` — "SHAKEDOWN phase2 - do not use", `in_progress`,
99 `game_events`, 9 `game_lineups`, created 2026-09-10 on the real **Huskies** team (24 other
games). It was surfacing as one of that team's three active games. Escalated to the owner, who
authorised deletion. Deleted by primary key 2026-09-19 after confirming no paired mirror game and
no linked practice. Cascade removed all 99 events and 9 lineup rows; verified census back to 0,
guest-only players still 0, Huskies 25 games → 24. Census is now clean for phase 3.

## Sweep progress

| # | Route | Pass | Landscape | Portrait | Findings |
|---|-------|------|-----------|----------|----------|
| 1 | `(auth)/sign-in` | A | done | n/a (signed in) | M1, M5 |
| 2 | `(tabs)/index` | A | done | done | H3 |
| 3 | `(tabs)/schedule` | A | done | done | H4 |
| 4 | `(tabs)/games/index` | A | done | done | M2 |
| 5 | `(tabs)/roster/index` | A | done | done | none |
| 6 | `(tabs)/messages/index` | A | done | done | M7 |
| 7 | `(tabs)/messages/[channelId]` | A | done | done | M4 |
| 8 | `(tabs)/practices/index` | A | done | done | H4 |
| 9 | `(tabs)/practices/[practiceId]/card` | A | done | done | M3 |
| 10 | `(tabs)/practices/[practiceId]/attendance` | A | source-only | done | see M3 |
| 11 | `(tabs)/games/[gameId]/attendance` | A | done | done | none |
| 12 | `(tabs)/games/[gameId]/lineup` | A+B | done | done | H5 |
| 13 | `(tabs)/games/[gameId]/score` | A+B | done | done | H1, M6, Q1 (H2 closed) |

## Findings

<!-- Entry format — copy verbatim per finding:

### <ID>. <one-line symptom>
**Route:** <route>  **Severity:** <S|H|M>  **Status:** <open | fixed | closed | not reproducible>
**Repro:** numbered steps from a cold launch
**Observed:** what the screen or the row actually did
**Expected:** what it should do
**Evidence:** screenshot path / zoom excerpt / offending DB row
**Cause:** file:line (once known)
**Defect bar:** which of the three tests it meets — wrong record | blocks task | misleads
-->

### H1. Play feed emits duplicate React keys when a half-inning recurs after a correction
**Route:** `(tabs)/games/[gameId]/score`  **Severity:** H  **Status:** fixed (W3, commit `e2a617b`)
**Repro:**
1. Score into a later half-inning, then void the events back and resume the earlier half-inning.
   (Observed on two independent real games, including "vs Timberlake" on the Huskies.)
2. Open the scoring screen.
3. Observe the React warning toast at the bottom of the screen.

**Observed:** `Encountered two children with the same key, '.$header-1-true'. Keys should be
unique so that components maintain their identity across updates.`

**Expected:** every FlatList child carries a unique key.

**Cause — verified against `game_events` in prod, not inferred from the screen.**
[`PlayFeed.tsx:20-32`](../../../apps/mobile/src/features/scoring/PlayFeed.tsx) —
`toFeedItems` inserts a half-inning header whenever `(inning, isTopOfInning)` differs from the
*previous* row, and keys it `header-${inning}-${isTopOfInning}`. That is unique only if each
half-inning appears as one contiguous run.

The Timberlake game's log shows the run is not contiguous, legitimately:

| seq | events | inning |
|-----|--------|--------|
| 1–13  | game_start, pitches, strikeout, hits, inning_change | Top 1 |
| 14–23 | hits, pickoffs, caught stealing, inning_change | Bot 1 |
| 24–26 | hit, caught stealing, hit | Top 2 |
| 27–41 | 15 × `event_voided` (filtered out of the feed) | — |
| 42–47 | pitches, strikeout | Top 1 |
| 48    | **a second `game_start`** | Top 1 |
| 49–58 | pitches, walk, 2 × stolen base | Top 1 |

Newest-first, the live rows therefore group Top 1 (58–42) → Top 2 (26–24) → Bot 1 (23–14) →
**Top 1 again** (13–1). The two Top 1 headers collide on key `header-1-true`, exactly the observed
warning.

**The feed's ordering is correct.** `buildPlayFeedRows` sorts by `sequenceNumber` and reverses
([`use-play-feed.ts:284`](../../../apps/mobile/src/features/scoring/use-play-feed.ts)), and voided
rows are deliberately retained struck-through. An earlier reading of the screenshot suggested the
sort was broken — the rows disprove that. `Play ball!` appearing mid-feed is the seq-48 second
`game_start` in its correct chronological slot, not a sorting error.

**Why it is High, not Medium:** duplicate keys make React reuse component instances across
positions, so the feed can render a row under the wrong half-inning header or fail to update one
after a void. The play feed is the coach's only surface for reviewing and correcting earlier plays
(phase 2 built it as S4 for exactly that), so a feed that can misattribute a play to the wrong
inning undermines the correction path it exists to provide. `game_events` is untouched, so no data
is corrupted — hence not Severe.

**Defect bar:** misleads.

**Fix (for Task 10):** make the header key unique independently of grouping — include the ordinal
of the header within the item list, or the `eventId` of the first row beneath it. Do **not**
"fix" the ordering: it is correct, and sorting rows by half-inning to force contiguity would
falsify the record by hiding that the coach reverted and resumed.

**Fixed in W3 (`e2a617b`).** Headers are now keyed by the `eventId` of the first row beneath them,
namespaced as `header-${eventId}` so a header cannot collide with that same event's row key. The
ordering was left untouched, as required — `use-play-feed.ts` is byte-for-byte unchanged.

The first attempt (`3f56b10`) keyed headers by ordinal index and was sent back in review: because
the feed is newest-first and prepends, an ordinal shifts every downstream header's key on every
recorded play. Harmless in itself (headers are stateless text) but strictly worse than keying on a
stable id, so it went through one fix round.

Five tests now cover grouping: the non-contiguous production shape asserts **both** four headers
and nine distinct keys — either assertion alone would pass against buggy code — plus a
header/first-row no-collision test that fails if the prefix is dropped.

**Verified in the simulator:** the `.$header-1-true` warning no longer appears on the game that
reproduced it, and the feed renders Top 1 → Top 2 → Bot 1 with voided entries struck through,
matching the event log exactly.

---

### QUESTION-1. A single game holds two `game_start` events — **RESOLVED**
Raised by H1's evidence: the Timberlake log has `game_start` at seq 1 **and** seq 48.

**Resolved by reading the state machine.** `deriveGameState`'s `GAME_START` case
(`packages/shared/src/utils/game-state.ts:96-117`) assigns exactly three things — `currentPitcherId`
from the payload, the two leadoff-batter caches, and `currentBatterId` from whichever leadoff
matches the half-inning. It touches **nothing** accumulated: not score, not outs, not inning, not
baserunners (verified — no reference to any of them appears in the case block).

So a second `game_start` is **well-defined and benign**. It re-points the current pitcher and batter
to the lineup's leadoff and leaves the replayed game state intact. For the observed case — a coach
voiding fifteen events back to the first inning and resuming — that is the desired behaviour, not a
corruption.

The one latent sharp edge: a second `game_start` recorded *without* a preceding revert would
silently reset the current batter and pitcher mid-plate-appearance. That requires the UI to offer
"start game" on an already-started game, which it does not. No fix needed; recorded so the next
person to see two `game_start` rows does not re-investigate.

---

### H2. Baserunners render as "Unnamed runner" — **CLOSED at triage, does not meet the defect bar**
**Route:** `(tabs)/games/[gameId]/score`  **Severity:** —  **Status:** closed, not a defect

**What was observed:** the ON BASE panel listed occupied bases as "Unnamed runner" on two
independent games.

**What triage established.** The Timberlake game has **10 `game_lineups` rows but 0
`opponent_game_lineups` / `opponent_lineup_entries` rows**. The screen was in the top of the 1st, so
the batting side was the *opponent* — which is also why the same screen read "No Timberlake order
set" (that copy is the opponent branch of
[`score.tsx:2024`](<../../../apps/mobile/app/(tabs)/games/[gameId]/score.tsx>), not our own lineup).
The unnamed runners are Timberlake runners, unnamed because no opponent lineup was ever entered.
The earlier hypothesis — a general identity-resolution failure, possibly phase 2 residue — was
wrong.

**Why it is closed rather than fixed.** Re-tested against all three tests:

- *Wrong record?* No. `game_events` stores runner ids; the label is presentation only.
- *Blocks a task?* No. Each ON BASE row carries its own base badge (2B, 3B) and its own
  Steal / Caught / Wild pitch / Passed ball / Pickoff chips, so two simultaneous runners remain
  individually addressable. The earlier claim that a scorer "cannot tell who is on base" was
  mistaken — they are disambiguated by base, just not by name.
- *Misleads?* No. "Unnamed runner" is an accurate description of a runner nobody named. The app
  offers "+ Batter" to name opponent batters; declining to is the coach's choice.

**Product observation, not a defect:** entering no opponent lineup makes the opponent's half of the
play-by-play read without names. That is reasonable degradation — most coaches do not roster the
opposition — but if the owner wants opponent narrative parity, that is a feature, not a fix.

**Owner call available:** this is the one finding closed on judgement rather than evidence. If you
want "Unnamed runner" treated as a defect anyway, say so and it goes back in as M.

---

### M1. "Use a different email" has a ~20pt tap target, roughly half the 44pt minimum
**Route:** `(auth)/sign-in`  **Severity:** M  **Status:** fixed (W7, commit `f9f288c`)
**Repro:**
1. Launch signed out, enter an email, tap "Send magic link".
2. On the "Check your email" screen, try to tap "Use a different email".

**Observed:** the control is a bare `Text` inside a `TouchableOpacity` with no padding. At
`text-sm` (14px) its tappable height is its line box, roughly 20pt.
**Expected:** at least 44×44pt, per Apple HIG — the same treatment the two buttons above it get.

**Cause:** [`sign-in.tsx:125-133`](<../../../apps/mobile/app/(auth)/sign-in.tsx>). By contrast the
"Verify code" and "Send magic link" buttons use `py-3.5` on `text-base`, giving ≈48pt.

**Defect bar:** blocks task — it is the only escape from the "Check your email" screen. A coach who
mistypes their address is stranded on a screen whose sole exit is the hardest thing on it to hit.

**Note:** measured from source rather than the accessibility tree, per harness note 1.

**Fixed in W7 (`f9f288c`).** The control gained `py-3` plus a hitSlop of 8. Verified arithmetic:
`spacing.3` is 0.75rem and `fontSize.sm`'s line-height is 1.25rem at a 16px rem base (this
project's `global.css` sets no root override), so 12 + 20 + 12 = **exactly 44px**, with the hitSlop
taking the effective touch region to roughly 60pt. It stays visually subordinate — only the target
grew.

---

---

### H3. Server-side deletions never reach the device — 7 of 9 synced collections ignore them
**Route:** `(tabs)/index` (observed), sync-wide  **Severity:** H  **Status:** fixed (W4, commits `fd5d3d5`→`4ed8bff`)
**Repro:**
1. Note a game shown on the dashboard.
2. Delete that game's row server-side.
3. Let the app sync, then reopen the dashboard.

**Observed:** the deleted game is still listed as **GAME IN PROGRESS**, indefinitely. Directly
observed: "vs SHAKEDOWN phase2 - do not use" remained on the dashboard for 20+ minutes and multiple
sync cycles after its row was deleted from prod.

**Expected:** a row the server no longer exposes to this device disappears from it.

**Cause:** [`sync-engine.ts:355-400`](../../../apps/mobile/src/sync/sync-engine.ts) — the pull
payload hardcodes `deleted: []` for `games`, `game_events`, `players`, `channels`, `messages`,
`league_players` and `opponent_players`. Only `game_lineups` and `opponent_game_lineups` compute a
real deletion set, by diffing local ids against server ids (Postgres keeps no tombstones). The
technique to fix the rest already exists in this file — `computeLineupDeletes` and the
`deletedOppLineupIds` diff at lines 274-285 — it was simply never applied to the other seven.

**Reachability — stated precisely, because it governs the severity.** Outright game *deletion* is
not a routine coach action: the only product path is
[`admin/setup/actions.ts:340`](<../../../apps/web/src/app/(app)/admin/setup/actions.ts>), a
platform-admin-only reset that deletes every game and team anyway. The routine path is different:
because the pull filters by team and RLS, **any row that leaves the device's scope is simply absent
from `updated`**, and with `deleted: []` it persists locally forever. A coach removed from a team,
or a game reassigned to another team, therefore keeps that data — and the games remain openable and
scoreable. That path is inferred from the code, not yet demonstrated, which is why this is H and
not S.

**Consequence if scored into:** `game_events.game_id` is a foreign key, so events recorded against
a locally-surviving deleted game cannot insert. Whether that fails only those events or wedges the
whole `synchronize()` cycle is **not yet established** — determine it in Task 7 rather than
assuming, since a wedged cycle would stop all other sync and would raise this to Severe.

**Defect bar:** misleads (the app presents data the server no longer has as live), and potentially
wrong record.

---

### H4. Schedule and Practices report a failed fetch as "nothing scheduled"
**Route:** `(tabs)/schedule`, `(tabs)/practices/index`  **Severity:** H  **Status:** fixed (W2, commit `441ca2f`)
**Repro:**
1. Put the device offline (or otherwise make the Supabase query fail).
2. Open Schedule, then Practices.

**Observed:** "No upcoming events." / "No upcoming practices."
**Expected:** an error state that distinguishes "we could not load this" from "you have nothing."

**Cause:** both screens query Supabase directly and swallow every failure.
[`schedule.tsx:52-57`](<../../../apps/mobile/app/(tabs)/schedule.tsx>) logs `console.warn` on query
error and then builds the list from `games.data ?? []`; the outer `.catch` at line 97 does the same;
there is no `error` state variable anywhere in the file, so line 148's `ListEmptyComponent` renders
the empty copy. [`practices/index.tsx:36-37`](<../../../apps/mobile/app/(tabs)/practices/index.tsx>)
has the identical shape. **One root cause, two screens — one fix.**

This directly violates CLAUDE.md's error-handling convention ("Never swallow errors silently").

**Compounding: both screens are online-only.** They call `getSupabaseClient()` rather than reading
WatermelonDB, even though `games` is already mirrored locally. In an offline-first app whose users
are coaches standing on fields, the two schedule surfaces are the ones that stop working without
signal — and they fail by lying rather than by saying so.

**Defect bar:** misleads.

**Fixed in W2 (`441ca2f`).** Both screens gained a real error state with a `Try again` control, so
a failure can no longer render the empty copy. Schedule now reads games from WatermelonDB and works
offline for games; practices and `team_events` have no local mirror and stay online-only, so a
partial failure shows the games it has plus an inline "Practices and events couldn't be loaded."
banner rather than discarding them. The merge/normalise logic was extracted to
`apps/mobile/src/features/schedule/schedule-data.ts` and covered by 9 unit tests.

Three data-shape traps were handled: WatermelonDB stores `scheduled_at` as a Unix ms number while
Postgres returns an ISO string (the merged list sorts with `localeCompare`, which would have thrown
on a number); the local `since` filter compares against ms; and the game `href` routes on
`remoteId` rather than the local row id.

**Verification is partial and the gap is deliberate.** The success path was confirmed on device —
Schedule still renders "No upcoming events." on a genuine empty success with no banner, so the new
branch does not swallow the empty state. The *failure* path was not exercised on device: the iOS
Simulator shares the host network and its Airplane Mode does not sever it, and the only other lever
(repointing `EXPO_PUBLIC_SUPABASE_URL`) risks a failed token refresh clearing the cached session,
which this session cannot restore because auth is magic-link. Failure rendering therefore rests on
the unit tests plus code review; `schedule.tsx:133` returns on `fullPageError` before the
`FlatList`, so the empty copy is structurally unreachable on failure. **Worth one manual offline
check on a real device before merge.**

---

### H5. The lineup editor permits an invalid defensive alignment
**Route:** `(tabs)/games/[gameId]/lineup`  **Severity:** H  **Status:** fixed (W1, commit `690df56`)
**Repro:** open the lineup for a game and assign the same fielding position to two players.

**Observed — verified in prod, not inferred from the screen.** `game_lineups` for the live
"vs Timberlake" game (`52786885-9e0d-43cc-b104-f7b78e5844ad`):

| batting_order | starting_position |
|---|---|
| 8 | `right_field` |
| 9 | `right_field` |

Both `is_starter = true`, and **no row carries `center_field`.** Nine fielders are assigned to eight
positions, with centre field unmanned. The editor accepted it and the screen displays it without
comment.

**Expected:** a duplicate defensive position is rejected, or at minimum flagged, the way a duplicate
batting slot already is.

**Cause:** validation covers the batting order but not the field.
[`lineup.tsx:203`](<../../../apps/mobile/app/(tabs)/games/[gameId]/lineup.tsx>) rejects "Duplicate
batting order positions", and line 213 guards guest slot collisions; web mirrors the batting-order
rule at
[`lineup/actions.ts:68-72`](<../../../apps/web/src/app/(app)/games/[gameId]/lineup/actions.ts>).
No equivalent check exists for `starting_position` on either client.

**Why it is High:** fielding putouts and assists are credited from the fielding sequence against the
lineup's positions (see CLAUDE.md, **HitLocation**). With two right fielders the position→player
mapping is ambiguous, so fielding credit cannot be attributed correctly; and a ball hit to centre
has no fielder to credit at all. This is the app's own statistics pillar consuming data its own
editor allowed to become invalid.

**Defect bar:** wrong record.

**Fixed in W1 (`690df56`).** `validateFieldingPositions` in
`packages/shared/src/rules/fielding-positions.ts`, called by both clients before any write. The
nine specific positions plus DH are exclusive; `INFIELD` / `OUTFIELD` / `UTILITY` and `null` may
repeat (batting slot 10 here is a legitimate null). Entries with a null `battingOrder` are skipped
because bench pitchers are deliberately stored as `batting_order: null` + `starting_position:
'pitcher'` so pitch counts keep tracking them — a rule that counted them would have rejected every
lineup with a bench pitcher, a worse regression than the bug. Covered by 7 unit tests including
that regression guard.

**Verified in the simulator**, not just by test: opening this game's lineup and pressing Save now
shows "Two players are assigned to RF. Each fielding position can only be assigned once." and
blocks the save. `game_lineups` re-queried afterwards is byte-for-byte unchanged, confirming the
guard runs before any write — on web it sits ahead of the existing `.delete()`, so a rejected save
cannot wipe the lineup and then fail to reinsert.

**Existing data is NOT repaired.** This game still holds two right fielders; the fix prevents new
invalid alignments but does not correct live rows, which was out of scope by decision. Practical
consequence: a coach opening this lineup cannot save until they reassign slot 8 or 9 — arguably the
right outcome, but it is a behaviour change on existing bad data and the owner should know.

---

### M2. The games list is sorted oldest-first, so live games are last
**Route:** `(tabs)/games/index`  **Severity:** M  **Status:** fixed (W8, commit `371ac1c`)
**Repro:** open Games on a team with a full season of history.

**Observed:** the list opens on March games from six months ago; the three in-progress games sit at
the bottom of a 24-game list.
**Expected:** the games a coach needs today are reachable without scrolling past the whole season.

**Cause:** [`games/index.tsx:205`](<../../../apps/mobile/app/(tabs)/games/index.tsx>) —
`Q.sortBy('scheduled_at', Q.asc)`.

**Defect bar:** blocks task — on game day, reaching the live game is the screen's whole purpose.

**Fixed in W8 (`371ac1c`) — but not by the obvious one-liner.** Flipping `Q.asc` to `Q.desc` only
half-works: sorting purely by date surfaces the most recently *scheduled* game, which is not the
game being played. On the current data one in-progress game would rise to the top while the other
stayed buried among completed games. So the query flipped to descending *and* a stable partition
(`sortGamesForList`) pins `in_progress` rows to the front, preserving date order within each group.
No other status is special-cased — pinning `scheduled` too was considered and rejected, since a
season of future fixtures would push the live game back down and recreate the bug.

---

### M3. Practice card shows the raw route pattern as its title, and misidentifies coaches
**Route:** `(tabs)/practices/[practiceId]/card`, `.../attendance`  **Severity:** M  **Status:** fixed (W6, commit `2102dd3`)
**Repro:** open a practice card as a head coach.

**Observed:** the navigation title reads **`practices/[practiceId]/card`** — the literal Expo Router
segment — and the body reads "You are not on this team's roster, so there's nothing to show here."
**Expected:** a real title, and copy that does not tell a head coach they are not on their own team.

**Cause — one branch, two symptoms.**
[`card.tsx:73`](<../../../apps/mobile/app/(tabs)/practices/[practiceId]/card.tsx>) renders
`<Stack.Screen options={{ title: 'My Practice' }} />` **only inside the success return**. Both the
loading branch (lines 52-58) and the no-player branch (lines 60-68) return before it, so Expo Router
falls back to the route pattern. The gate itself is `!activeTeam?.playerId` — correct logic, since
this screen is a *player's* rotation card and a coach has no `playerId`, but the copy asserts
something false about a coach's team membership.

**Defect bar:** misleads.

**The sibling screen had it too.** `attendance.tsx:149` has the identical
`<Stack.Screen>`-inside-the-success-branch bug, so its loading and not-a-coach branches also showed
the raw route pattern. Both were fixed.

**Reachability was the opposite of what it looked like.** `practices/index.tsx:115-121` already
routes by role — coaches to attendance, players to the card — so a coach never lands here *through
the app*. But `notifications.ts:95` routes `pre_practice` to the card **unconditionally**, and
`pre_practice` is genuinely dispatched by `practice-notifications-dispatch`. So the only way a coach
reaches this screen is the one path that actually fires in production. That makes the coach branch
the main case, not an edge case — and, per the correction under M6, this is the live notification
path, not M6's.

**Fixed in W6 (`2102dd3`).** `<Stack.Screen>` is hoisted so the title applies on every branch in
both files. The `!activeTeam?.playerId` gate is unchanged — it is correct, since this screen builds
a *player's* rotation and a coach has none — but the branch now splits on `activeTeam.isCoach`: a
coach sees "This is the player's practice card. As a coach, open attendance instead." with an
**Open attendance** control that `router.replace`s to the attendance route for the same practice
(`replace`, not `push`, so the back stack does not accumulate a screen they were never meant to
see). Anyone else with no `playerId` still sees the original copy, which is accurate for them.

**`notifications.ts` was deliberately left alone.** Role-routing at notification-tap time would be
a race — `useRole()` resolves asynchronously and may not have loaded when the tap is handled.
Handling it on the destination screen works regardless of when role resolves.

---

### M4. An empty message channel renders a blank void with no empty state
**Route:** `(tabs)/messages/[channelId]`  **Severity:** M  **Status:** fixed (W9, commit `d08546e`)
**Repro:** open a channel that has no messages (observed on "General").

**Observed:** the entire message area is blank. No "No messages yet", no illustration, nothing —
only the composer at the bottom.
**Expected:** absence reads as absence. Every other list in the app does this correctly
("No upcoming events.", "No upcoming practices.", the games empty state).

**Defect bar:** misleads — an empty channel is indistinguishable from one that failed to load or is
still loading.

**Fixed in W9 (`d08546e`), after one fix round.** The `FlatList` now has a `ListEmptyComponent`
reading "No messages yet.", matching the app's existing "No … yet." convention and the
`py-10 text-center text-gray-500` styling used by the other empty states.

Two non-obvious details. The list is `inverted`, so the empty component needed a `scaleY: -1`
counter-transform or the text would have rendered upside-down — invisible to any unit test. And the
first attempt added a "flash guard" (`useState` + `useEffect` gating the empty state) that was
removed in review: `withObservables` returns `null` while `isFetching`, so the component never
mounts before data has emitted and no flash was reachable. The guard protected nothing and
introduced a one-frame blank on genuinely empty channels — the same defect W9 exists to fix.

---

### M5. The sign-in screen has no scroll container, so large text can strand it
**Route:** `(auth)/sign-in`  **Severity:** M  **Status:** fixed (W7, commit `f9f288c`) — fixed structurally; never reproduced live
**Observed:** `sign-in.tsx` is the only top-level screen with no scroll container. Its root is
`KeyboardAvoidingView > View className="flex-1 items-center justify-center"`; every other surveyed
screen (dashboard, roster, messages, games, schedule, practices) wraps content in a `ScrollView` or
`FlatList`.

**Why it matters:** at `accessibility-extra-extra-extra-large` the dashboard's content grew past the
fold but stayed reachable *because it scrolls*. Sign-in cannot do that. With the keyboard raised in
landscape (~480pt of usable height) and accessibility text, the stacked title, subtitle, label,
input, button and footer can exceed the viewport with no way to reach the button. The "Check your
email" branch is worse — it carries an extra input and the extra link.

**Not yet reproduced** because confirming it requires signing out, and authenticating is the owner's
action, not mine. Confirm by signing out with accessibility text enabled and checking the
"Send magic link" button is still reachable with the keyboard up. If it is reachable, close as
`not reproducible`.

**Defect bar:** blocks task — if it reproduces, a low-vision coach cannot sign in at all.

---

### M6. Entering the scoring screen by deep link loses the team names
**Route:** `(tabs)/games/[gameId]/score`  **Severity:** M  **Status:** fixed (W5, commit `c8374d4`)
**Repro:**
1. Open the scoring screen via a deep link carrying only `gameId`
   (`baseballcoaches:///games/<id>/score`) — or tap a `kind: 'game'` push notification.
2. Compare with reaching the same game by tapping it in the app.

**Observed (deep link):** header "**vs Opponent**", scoreboard "**Home** – **Opponent**",
"No **Opponent** order set".
**Observed (in-app nav, same game, same orientation):** "vs Timberlake", "Huskies 0 – 3 Timberlake",
"No Timberlake order set".
**Expected:** the real team names either way.

**Isolated by controlled comparison.** This first appeared during the portrait pass and looked like
an orientation defect. Re-entering the *same route* in the *same orientation* by in-app navigation
rendered correctly, which rules orientation out — the variable is how the screen is entered.

**Cause:** [`score.tsx:63`](<../../../apps/mobile/app/(tabs)/games/[gameId]/score.tsx>) reads the
names from route params with literal fallbacks:

```ts
const { gameId, teamId: teamIdParam = '', opponentName = 'Opponent', teamName = 'Home' } =
  useLocalSearchParams<...>();
```

In-app navigation passes `teamName` / `opponentName` as params; a deep link supplies only `gameId`.
Note the screen already solves this correctly one line down for the team id —
`const teamId = game?.teamId ?? (teamIdParam as string)` (line 92) prefers the loaded game record
and falls back to the param. The names never got the same treatment, even though `game` carries
them.

**Reachability — corrected.** I first wrote that every game push notification lands on a
"Home – Opponent" scoreboard. That over-claimed. Checking server-side, the only `kind` any edge
function sends is `pre_practice`, and `pitch-count-calculator` sends no `kind` at all, so the
`kind: 'game'` branch at [`notifications.ts:103-108`](../../../apps/mobile/src/lib/notifications.ts)
is **unreachable today** — the handler exists, nothing triggers it. M6 is reachable through plain
deep links (`baseballcoaches:///games/<id>/score`), which is how it was reproduced. The *live*
notification reachability belongs to **M3** instead: `pre_practice` really is sent, and it routes
straight to the practice card.

**Scores are unaffected** — re-checked on device: the deep-linked scoreboard reads 0 – 3, identical
to the in-app-navigated view. Only the two names degrade.

**Why it is Medium, not Severe:** `teamName` / `opponentName` are display-only — screen title,
scoreboard labels, batting-order headings, the "Add X batter" modal. They are never written into an
event payload, so no wrong record is produced. Scores and all game state remain correct.

**Defect bar:** misleads — with three games in progress, the header is a coach's main confirmation
that they are scoring the right one.

**Fixed in W5 (`c8374d4`).** The derivation moved out of the 3,430-line screen into
`apps/mobile/src/features/scoring/game-identity.ts` (pure) plus `use-game-identity.ts` (the hook),
so the resolution rules are unit-testable without rendering the screen. `opponentName` now resolves
`game.opponentName` → param → `TBD`, treating the empty string as absent because `mapGame` coerces a
NULL server opponent to `''`. `teamName` resolves from `activeTeam.teamName` **only when
`activeTeam.teamId === teamId`** — there is no local `teams` table, and the device can hold another
team's in-progress game via the unscoped `public_view_in_progress_games` policy, so an unconditional
`activeTeam.teamName` would label that game confidently wrong rather than merely generic. `isHome`
and the home/away label swap are unchanged, verified line-by-line against the pre-extraction code.

`notifications.ts` was deliberately left alone: forwarding params on a branch nothing triggers would
be dead code.

**Verified in the simulator** through the entry path that produced the bug — the same deep link now
renders "vs Timberlake", "Huskies 0 – 3 Timberlake" and "No Timberlake order set".

---

### M7. Direct-message channels show no counterparty
**Route:** `(tabs)/messages/index`  **Severity:** M  **Status:** fixed (W10, commit `6dd9e47`)
**Observed:** the team's direct channel renders as the literal string "Direct Message", with no
participant name and no subtitle, while topic and announcement channels show a name and description.
**Expected:** the other participant's name.

**Cause:** [`messages/index.tsx:48`](<../../../apps/mobile/app/(tabs)/messages/index.tsx>) —
`{channel.name ?? 'Direct Message'}`. Direct channels store `channels.name = null` (confirmed in
prod), and nothing resolves the counterparty from channel membership.

**Defect bar:** blocks task — with one DM it is merely unhelpful; with two or more, every row reads
"Direct Message" and the coach cannot tell the conversations apart or pick the right one. Logged now
because the cause is structural rather than data-dependent.

**Fixed in W10 (`6dd9e47`), and the route mattered.** There is no local membership data to look the
counterparty up from: the pull filters `channel_members` to the current user and `mapChannel` keeps
only `can_post`. Both obvious fixes were closed off — storing members locally needs a schema bump
plus a migration (a bump without one wipes every device's unsynced offline events), and an online
lookup would reintroduce precisely the online-only failure mode W2 removed from Schedule and
Practices.

The offline route uses `messages.sender_name`, which is already denormalised into WatermelonDB and
commented "Denormalized for offline display". `resolveChannelLabel` returns an explicit channel name
if present, else — for a direct channel — the `senderName` of the most recent message whose sender
is not the current user, selected by comparing `createdAt` rather than trusting array order.

It also fixes a quieter second bug: an unnamed *topic* channel previously rendered "Direct Message"
as well. It now reads "Channel".

**Known limitation, stated rather than hidden:** a DM with no messages, or one where only the
current user has written, still reads "Direct Message" — there is no counterparty message to derive
a name from offline. Documented in a comment at the top of `channel-label.ts`.


---

## Fix order

Triage completed 2026-09-19. **11 open findings** (H2 closed at triage), consolidated into
**10 work items** — H4 already covers two screens under one cause, and M1+M5 are grouped because
they share a file and a single review. Below the 25-finding escape hatch, so no renegotiation
needed.

Work strictly in this order: all High, then all Medium. Each item is one Task 10 instance and one
commit, except where noted.

| # | Item | Findings | Bar | Where the fix belongs |
|---|------|----------|-----|----------------------|
| ~~**W1**~~ | ~~Reject duplicate defensive positions~~ **DONE** `690df56` | H5 | wrong record | `packages/shared/src/rules/fielding-positions.ts` |
| ~~**W2**~~ | ~~Schedule + Practices error state + offline games~~ **DONE** `441ca2f` | H4 | misleads | `schedule.tsx`, `practices/index.tsx`, `features/schedule/schedule-data.ts` |
| ~~**W3**~~ | ~~Unique play-feed header keys~~ **DONE** `e2a617b` | H1 | misleads | `PlayFeed.tsx` |
| ~~**W4**~~ | ~~Propagate server-side deletions~~ **DONE** `4ed8bff` | H3 | misleads | `sync-engine.ts`, `sync/reconcile-deletions.ts` |
| ~~**W5**~~ | ~~Derive team names from the game record~~ **DONE** `c8374d4` | M6 | misleads | `features/scoring/game-identity.ts` |
| ~~**W6**~~ | ~~Practice card title + coach copy~~ **DONE** `2102dd3` | M3 | misleads | `practices/[practiceId]/{card,attendance}.tsx` |
| ~~**W7**~~ | ~~Sign-in escape hatch + scroll container~~ **DONE** `f9f288c` | M1, M5 | blocks | `(auth)/sign-in.tsx` |
| ~~**W8**~~ | ~~Games list: live games first~~ **DONE** `371ac1c` | M2 | blocks | `games/index.tsx`, `features/games/sort-games-for-list.ts` |
| ~~**W9**~~ | ~~Empty-state for an empty channel~~ **DONE** `d08546e` | M4 | misleads | `messages/[channelId].tsx` |
| ~~**W10**~~ | ~~Name the direct-message counterparty~~ **DONE** `6dd9e47` | M7 | blocks | `messages/index.tsx`, `features/messaging/channel-label.ts` |

### Ordering rationale

**W1 first** — it is the only finding that writes a wrong record. A live game already holds two
right fielders and no centre fielder, and fielding putouts are credited by position, so every day
it stays open is more mis-attributed fielding data.

**W2 second** — one cause, two screens, and it is the app's worst failure mode in its core
scenario: an offline-first product telling a coach on a signal-less field that their schedule is
empty. Highest ratio of harm to effort.

**W3 third** — protects the correction surface phase 2 built. Fix the key only; **do not** sort rows
to force contiguity, which would hide a real revert-and-resume from the record.

**W4 fourth, and it opens with an investigation, not a patch.** The demonstrated path
(platform-admin reset) nukes everything anyway, so the severity rests on the inferred RLS-scope
path. **First establish whether a row leaving RLS scope actually persists locally.** If it does,
apply the `computeLineupDeletes` diff already in this file to the other seven collections. If it
provably cannot, downgrade W4 to M and say so rather than building deletion diffing for a case that
never occurs. Also settle, while here, whether events orphaned against a deleted game fail alone or
wedge the whole `synchronize()` cycle — a wedged cycle would make this Severe.

**W5–W10** are independent and can run in any order; listed by blast radius. W5 is worth doing
early among the Mediums because every game push notification currently lands on a "Home – Opponent"
scoreboard.

### Notes carried into Task 10

- **W5 and the `score.tsx` extraction rule.** The plan requires extracting a region of `score.tsx`
  before editing it. Lines 63–98 (param read, `teamId` derivation, `homeLabel`/`awayLabel`) are a
  coherent unit: extract them as `use-game-identity.ts` in `features/scoring/`. That makes the fix
  unit-testable without rendering a 3,430-line screen, which is the rule's actual purpose — not a
  token extraction to satisfy it.
- **W1 belongs behind the phase 2 rules seam**, not in a form check. Expanded lineups and EH slots
  make "which position assignments are legal" a league rule. A null `starting_position` is
  legitimate (batting slot 10 in the observed game) and must stay allowed.
- **W7 carries an unconfirmed half.** M1 is confirmed from source; M5 needs a sign-out with
  accessibility text to reproduce. Reproduce M5 first; if it does not, fix M1 alone and close M5 as
  not reproducible.
- **Q1 is not in this list.** Whether `deriveGameState` handles a second `game_start` is an open
  question for Task 7's Pass B, not a fix.


## CodeRabbit review — still outstanding

CLAUDE.md requires a CodeRabbit review after implementing a feature, and the design spec makes it
exit criterion 6. It has **not** run on this branch.

The CLI is not installed, and its only documented install path pipes a remote script to a shell,
which was not run. I then assumed opening the PR would trigger CodeRabbit's GitHub app, because it
had genuinely reviewed PR #207 ("Actionable comments posted: 13", with no human trigger comment).
That assumption was wrong: on PR #209 CodeRabbit replied that the repository "does not receive
automatic reviews because it has fewer than 10 stars," and offered a manual trigger instead.

So this criterion is open, not met. It is being triggered manually. Recording it here rather than
leaving the earlier, incorrect claim standing.

## Task 11 — regression shakedown (composed verification)

Run after all ten fixes landed, to prove they compose rather than only work in isolation. Created
`f47a3db4-5820-4587-a6c7-6fea2edebdcd` ("SHAKEDOWN 2026-09-21 regression") via SQL, because mobile
has no game-creation UI — the disclosed limitation carried from phase 2.

What the pass exercised, and what held:

| Behaviour | Result |
|---|---|
| W4 reconciliation leaves a newly-created in-scope game alone | the game synced and was not deleted |
| W1 valid alignment feeds the fielding UI | the hit-location diagram rendered all nine positions **including CF** |
| Phase 2 H1 — wizard reads the real lineup | step 2 pre-populated slots 1–9 from `game_lineups` |
| W5 deep-link identity | header and scoreboard read "Huskies 0 – 0 SHAKEDOWN 2026-09-21 regression", not "Home – Opponent" |
| W3 play feed | rendered newest-first with no duplicate-key warning |
| Phase 2 S1 — in-play ball is a pitch | pitch count went 2 P/1 S → **3 P/2 S**, and `seq 4` is `pitch_thrown` with `outcome: in_play`, **ordered before** the `hit` at `seq 5` |
| HitLocation payload | the `hit` row carries spray coordinates and `fieldingSequence [7]` — left field, matching the tap |
| Phase 2 S2 — finalize | End Game drove `status = completed` with `completed_at` set |

Teardown followed the runbook: both non-cascading edges checked (no paired game, no linked
practice), deleted by primary key, then verified — **0 remaining `SHAKEDOWN%` games, 0 orphan
events, 0 orphan lineups, 0 guest-only players, and the Huskies back to their pre-pass 24 games.**

## Portrait pass — result

All 13 routes re-driven in portrait after the owner rotated the device. **No portrait-only layout
defect was found.** Every previously logged finding that has a visual component reproduced
identically in portrait: H1, H4, H5, M2, M3 and M4 all recur.

The more interesting result is the reverse of what was expected. **Portrait renders better than
landscape**, not worse:

- the games list shows opponent, date, venue, score, status pill and both action buttons in each
  card, where landscape stretched the same cards wide and crammed the content into a sliver
- the lineup screen reveals a "Guests — Guest players are disabled by the league" section that
  landscape cut off entirely
- the dashboard shows the full nav list plus a **Sign out** button, and the **tab bar** is visible;
  landscape pushed all of them below the fold

This is consistent with harness note 6: the app declares `orientation: "portrait"` and its layouts
were evidently designed for portrait, while iPad silently permits landscape. So the untuned
orientation is **landscape** — the one a coach is most likely to use to score a game on an iPad.
That reframes the "wasted horizontal space" observations from the landscape pass: they are not
isolated preferences but symptoms of screens being shown in an orientation nothing designed for.
Left unlogged individually per the defect bar, but recorded here as a pattern worth a product
decision: either design the landscape layouts or lock the iPad to portrait.

## Checks that resolved as "no defect"

**Dark mode — spec open question #4: RESOLVED, out of scope.** With
`xcrun simctl ui <udid> appearance dark`, every surveyed screen renders **identically to light
mode** — white cards, light backgrounds, dark text, no adaptation anywhere. Per the rule set in the
ledger before testing: uniform absence of dark-mode support is a feature request, not a defect. It
would only be in scope if support were *partial*, producing unreadable or mismatched panels. It is
not partial. Closed.

**Dynamic Type — mostly clean.** At `accessibility-extra-extra-extra-large`, text scales correctly
and nothing truncates or clips; cards grow and content reflows below the fold, which is correct
behaviour given every main screen scrolls. The single exception is sign-in, logged as M5 above.

**Role gating — spec open question #5: RESOLVED as static-only.** The sweep ran on one head-coach
account. Testing a player or parent view would require a second account, and creating one is out of
bounds. Per the plan's decision rule, role gating was therefore **not** verified by observation, and
no role-gating findings are claimed. One adjacent observation did surface and is logged as M3: the
practice card gates on `activeTeam.playerId`, which correctly excludes coaches but tells them they
are "not on this team's roster".

---

## Carried from phase 2 — not re-logged

- **No game creation on mobile** (phase 2's H3). Still absent, but it is now a *disclosed* product
  decision rather than an oversight: `games/index.tsx:41` tells the coach "Games are added by
  coaches on the web dashboard." It therefore does not mislead. It does still block a coach who is
  at a field with only an iPad and needs a scrimmage or makeup game. Left for the owner to decide
  rather than re-litigated here. **Operational impact on this phase:** Task 6's "create the game
  from the app" step is impossible, so Pass B's game must be created on web.

## Not logged (failed the defect bar)

Recorded so they are not re-investigated:

- **"No SHAKEDOWN phase2 - do not use order set."** Looked like broken string interpolation, but
  [`score.tsx:2024`](<../../../apps/mobile/app/(tabs)/games/[gameId]/score.tsx>) renders
  ``No {weBat ? 'batting order' : `${opponentName} order`} set``, which reads correctly for a normal
  opponent ("No Timberlake order set"). It only looked wrong because the synthetic opponent name was
  itself a sentence. Not a defect.
- **Sign-in form stretches full width on iPad.** `w-full` inside `px-6` with no `max-w-*`, so the
  email field spans nearly the whole landscape width. Ugly, but it does not block, mislead, or
  corrupt. Preference, not defect.
- **Roster and dashboard cards are mostly empty space on iPad.** Full-width rows holding a badge and
  a name. Same reasoning as above — preference.
- **Dev-build artefacts.** The LogBox warning toast, its overlap with the tab bar, and Metro's
  broken HMR entry-point registration do not ship in a release build. The *underlying* duplicate-key
  bug (H1) is real in production; only its on-screen warning is dev-only.
- **RSVP list sorted by jersey number while Roster is alphabetical.** Inconsistent, harmless.
- **"No Timberlake order set" on a game with no lineup.** Correct copy, correct condition.
- **Attendance appeared to omit two active players.** Landscape RSVPs showed 13 rows against 15
  active players in `players`, suggesting Jace Irwin #33 and Carlos Guzman #34 were being dropped.
  Re-checked in portrait: all 15 render. They were simply below the fold. No defect — recorded so
  the discrepancy is not re-investigated.
