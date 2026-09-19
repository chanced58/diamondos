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

2. **Screenshots and taps share one frame, rotated 90° from upright.** The capture frame is
   834×1210 with origin top-left, and taps land where the screenshot shows them — verified
   empirically by tapping the sign-in email field at (420, 605) and observing focus plus keyboard.
   **The upright view is the screenshot rotated 90° clockwise:** image-left is true-top,
   image-top is true-right, image-right is true-bottom, image-bottom is true-left. Every layout
   judgement below applies that transform. Stated once here rather than repeated per finding.

3. **Metro's HMR entry-point registration fails** with `Unable to resolve module
   .../expo-router/entry` from `HmrServer._registerEntryPoint`. The initial bundle builds and the
   app runs, so this is a developer-experience problem, not a coach-facing one — it fails the
   defect bar and is not logged as a finding. Practical effect on this sweep: fast refresh is
   unreliable, so fixes are verified against full rebuilds.

4. **A stale simulator binary initially showed `requireNativeComponent: "RNSVGRect" was not found
   in the UIManager`.** Resolved by the `expo run:ios` rebuild — `react-native-svg` is a native
   module, as CLAUDE.md warns. Not a defect; recorded so the symptom is not re-investigated.

5. **The app declares portrait-only but iPad permits all four orientations.** `app.json` sets
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
| 1 | `(auth)/sign-in` | A | partial | | M1 |
| 2 | `(tabs)/index` | A | | | |
| 3 | `(tabs)/schedule` | A | | | |
| 4 | `(tabs)/games/index` | A | | | |
| 5 | `(tabs)/roster/index` | A | | | |
| 6 | `(tabs)/messages/index` | A | | | |
| 7 | `(tabs)/messages/[channelId]` | A | | | |
| 8 | `(tabs)/practices/index` | A | | | |
| 9 | `(tabs)/practices/[practiceId]/card` | A | | | |
| 10 | `(tabs)/practices/[practiceId]/attendance` | A | | | |
| 11 | `(tabs)/games/[gameId]/attendance` | A | | | |
| 12 | `(tabs)/games/[gameId]/lineup` | A+B | | | |
| 13 | `(tabs)/games/[gameId]/score` | A+B | partial | | H1, H2, Q1 |

## Findings

<!-- Entry format — copy verbatim per finding:

### <ID>. <one-line symptom>
**Route:** <route>  **Severity:** <S|H|M>  **Status:** open
**Repro:** numbered steps from a cold launch
**Observed:** what the screen or the row actually did
**Expected:** what it should do
**Evidence:** screenshot path / zoom excerpt / offending DB row
**Cause:** file:line (once known)
**Defect bar:** which of the three tests it meets — wrong record | blocks task | misleads
-->

### H1. Play feed emits duplicate React keys when a half-inning recurs after a correction
**Route:** `(tabs)/games/[gameId]/score`  **Severity:** H  **Status:** open
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

A regression test must construct rows whose half-inning recurs non-contiguously (Top 1, Top 2,
Bot 1, Top 1) and assert that all generated keys are distinct and that four headers are emitted,
not three — the existing `PlayFeed.test.tsx` has no such case.

---

### QUESTION-1. A single game holds two `game_start` events
Not a finding yet — an open question raised by H1's evidence. The Timberlake log has `game_start`
at seq 1 **and** seq 48. Determine during Task 7 how `deriveGameState` treats a second
`game_start`: whether it re-initialises (discarding earlier state), is ignored, or produces
undefined behaviour. If a restart-after-void is a supported coach action, the state machine's
handling of it needs a test; if it is not supported, the UI should not permit it. Resolve before
the phase closes rather than leaving it latent.

---

### H2. Baserunners render as "Unnamed runner" — the scorer cannot tell who is on base
**Route:** `(tabs)/games/[gameId]/score`  **Severity:** H  **Status:** open — **provisional, needs reconfirmation**
**Repro:** observed on the phase 2 residue game: the ON BASE panel listed 1B, 2B and 3B all as
"Unnamed runner".

**Observed:** three occupied bases, no runner identifiable.
**Expected:** each occupied base names its runner.

**Cause (candidate):** [`score.tsx:1704`](<../../../apps/mobile/app/(tabs)/games/[gameId]/score.tsx>) —
`runnerIdentity.get(id)?.name ?? nameById.get(id) ?? extraNames[id] ?? 'Unnamed runner'`. All three
lookups missed. The same game showed "No … order set", i.e. it had no `game_lineups` rows, which is
exactly phase 2's H1 symptom — so these runners were most likely added mid-game via "+ Batter" as
free text and never got a persisted identity.

**Now reproduced on a second, independent game.** The "vs Timberlake" game (a real, undeleted
Huskies game) shows the same thing: ON BASE lists 3B and 2B both as "Unnamed runner", and the same
screen reads "No Timberlake order set". So this is not residue from the deleted phase 2 game.

**Still provisional on one point:** both observed games lack `game_lineups` rows, so the runners
were most likely added mid-game via "+ Batter" as free text. What is not yet established is whether
a game *with* a proper lineup also loses runner identity. Confirm during Task 7 — score a runner
onto base from a wizard-created lineup and check the ON BASE panel names them. If a proper lineup
resolves names correctly, this narrows to "runners added via + Batter have no persisted identity",
which is a different and smaller fix than a general identity-resolution failure.

**Defect bar:** blocks task (a scorer who cannot identify baserunners cannot score a steal,
pickoff, or runner outcome correctly).

---

### M1. "Use a different email" has a ~20pt tap target, roughly half the 44pt minimum
**Route:** `(auth)/sign-in`  **Severity:** M  **Status:** open
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

---

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
