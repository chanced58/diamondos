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
| 13 | `(tabs)/games/[gameId]/score` | A+B | partial | | H1, H2? |

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

### H1. Play feed emits duplicate React keys, so plays can render under the wrong half-inning
**Route:** `(tabs)/games/[gameId]/score`  **Severity:** H  **Status:** open
**Repro:**
1. Cold launch the app on a game with a substantial event log (observed on a 99-event game).
2. Open the scoring screen and let the play-by-play feed render.
3. Observe the React warning toast at the bottom of the screen.

**Observed:** `Encountered two children with the same key, '.$header-1-true'. Keys should be
unique so that components maintain their identity across updates.`

**Expected:** every FlatList child carries a unique key.

**Cause:** [`PlayFeed.tsx:20-32`](../../../apps/mobile/src/features/scoring/PlayFeed.tsx) —
`toFeedItems` inserts a half-inning header only when `(inning, isTopOfInning)` *changes from the
previous row*, and keys it `header-${inning}-${isTopOfInning}`. That is correct only if every
half-inning appears as one contiguous run. When a half-inning recurs non-contiguously the function
emits a second header with a key identical to the first. The warning firing on a real game proves
the rows are not always contiguously grouped — so the latent assumption is actually violated in
production data, not just in theory.

**Why it is High, not Medium:** duplicate keys make React reuse component instances across
positions, so the feed can display a play under the wrong half-inning header or fail to update a
row after a void. The play feed is the coach's only way to review and correct earlier plays
(phase 2's S4 built it for exactly that), so a feed that can misattribute a play to the wrong
inning undermines the correction path it exists to provide. No data is corrupted — `game_events`
is untouched — which is why it is not Severe.

**Defect bar:** misleads.

**Fix sketch (for Task 10):** the key must be unique regardless of grouping — include the item's
index or the first row's `eventId` in the header key. Additionally decide whether non-contiguous
half-innings are themselves correct: if the feed is meant to be strictly newest-first by
half-inning, the rows should be sorted before grouping, and the duplicate key is a *symptom* of a
sort bug rather than the defect itself. Determine which before fixing — patching only the key
would hide a real ordering problem. A regression test must build rows with a non-contiguous
half-inning and assert both key uniqueness and header count.

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

**Why provisional:** the only evidence is a game created before phase 2's lineup fix landed, and
which has since been deleted. It may be pre-fix residue rather than current behaviour. **Do not fix
this from the evidence above.** Reconfirm during Task 7's clean Pass B game — specifically by
adding a batter mid-game via "+ Batter" and checking whether that runner is named on base. If it
does not reproduce, close this as `not reproducible` rather than fixing speculatively.

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
