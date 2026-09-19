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
| _(none yet)_ | | | |

Pre-flight census at Task 2: `select count(*) from games where opponent_name like 'SHAKEDOWN%'` → **0 rows.**

## Sweep progress

| # | Route | Pass | Landscape | Portrait | Findings |
|---|-------|------|-----------|----------|----------|
| 1 | `(auth)/sign-in` | A | | | |
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
| 13 | `(tabs)/games/[gameId]/score` | A+B | | | |

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

_None logged yet — sweep begins at Task 3._
