# iOS Phase 3 — UI and Scorekeeping Shakedown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sweep all 13 iOS routes by hand on an iPad Pro 11-inch simulator, record every defect in a committed ledger, and fix every one of them with a regression test.

**Architecture:** Two passes over the app — a cold structural walk of every route, then one full hand-scored game — produce a findings ledger. Each ledger entry then drives one instance of a fixed TDD loop: failing test, fix, simulator re-verify, commit. Rule defects are fixed behind the existing `packages/shared/src/rules/` seam, never in mobile JSX. Regions of `score.tsx` and `PitchInput.tsx` are extracted to `features/scoring/` as a precondition of editing them.

**Tech Stack:** Expo SDK 51 + Expo Router v3, React Native, WatermelonDB, Supabase (`diamondos-prod`), Jest + `jest-expo` preset + React Native Testing Library, Turborepo + pnpm.

**Spec:** [2026-09-19-ios-phase-3-ui-and-scorekeeping-audit-design.md](../specs/2026-09-19-ios-phase-3-ui-and-scorekeeping-audit-design.md)

## Why this plan has a repeating task instead of enumerated fix tasks

Tasks 1–9 and 11–12 are fully specified: their inputs, commands, and gates are all knowable now. **Tasks 3–8 are discovery tasks** — their deliverable is ledger entries, not code. The fixes cannot be enumerated in advance because the findings do not exist yet.

Task 10 therefore specifies the fix loop **once, completely, with a fully worked example**, and every ledger entry becomes one instance of it. This is a template with all its content present, not a placeholder. Do not treat Task 10 as one task to check off — it runs once per finding, and Task 9 is where the actual list of instances gets written down.

## Global Constraints

- **Target device: iPad Pro 11-inch (M5), iOS 26.5, UDID `470FA5DE-B47C-4CA5-BB02-F1837E344141`.** Only this device. iPhone and iPad mini are out of scope for phase 3.
- **Both orientations are in scope.** Landscape and portrait are layout dimensions of the one device, not a second device.
- **Database: `diamondos-prod` only.** It is the only Supabase environment this project uses. Access it through the Supabase MCP tools (`mcp__2f4b6150-...__execute_sql`), never the Supabase CLI or Docker — the CLI path has failed in this project before.
- **Shakedown protocol, non-negotiable:** every game the sweep creates has `opponent_name` starting with the literal string `SHAKEDOWN`; its `id` is written into the ledger *before* any event is scored; teardown deletes only rows the sweep created; no pre-existing row is ever modified or deleted.
- **`game_events` is append-only.** Never `UPDATE` or `DELETE` a `game_events` row as part of a fix or a correction. Corrections happen by voiding (`EVENT_VOIDED`) and re-recording. The one exception is shakedown teardown, which deletes the synthetic game's own events.
- **Never bump `apps/mobile/src/db/schema.ts` `version`** without adding a matching step in `apps/mobile/src/db/migrations.ts`. A bump without a migration wipes the device database.
- **Rule logic belongs in `packages/shared/src/rules/`.** If a fix is a baseball rule, it goes behind that seam and both clients call it. Putting a rule back into a mobile JSX conditional re-opens the exact seam phase 2 closed.
- **Commit format:** Conventional Commits. One commit per finding. End every commit message with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- **Gates:** `pnpm test`, `pnpm type-check`, `pnpm lint` must be green before the PR opens.
- **Defect bar:** a finding is logged only if it (1) produces a wrong or missing record, (2) blocks a game-day task, or (3) misleads — asserts something untrue, or renders a partial state that reads as complete. Visual preferences are not logged, not fixed, not carried as debt.
- **Ledger overrun escape hatch:** if the sweep exceeds 25 findings, stop and take the ledger to the owner before fixing continues.

---

### Task 1: Baseline the harness and scaffold the findings ledger

Establishes that the app builds and runs on the target device and that the test gates' starting state is known, so a later red gate is attributable to this phase's work rather than inherited.

**Files:**
- Create: `docs/superpowers/specs/2026-09-19-ios-phase-3-findings.md`

**Interfaces:**
- Consumes: nothing.
- Produces: the ledger file, whose entry format every discovery task (3–8) appends to, and whose `Baseline` section records the pre-phase gate state.

- [ ] **Step 1: Open the live simulator panel before building anything**

Call the iOS simulator control tool with `action: "attach"` and `device: "iPad Pro 11-inch (M5)"`. Do this **first** — the device is already booted, the panel opens instantly, and it surfaces the one-time device-access prompt while the owner is still present.

If it errors with no booted device, boot it and retry once:

```bash
xcrun simctl boot 470FA5DE-B47C-4CA5-BB02-F1837E344141
```

- [ ] **Step 2: Record the baseline gate state**

```bash
cd /Users/chance/projects/diamondos/.claude/worktrees/ios-mobile-app-dev-bd7875
pnpm type-check 2>&1 | tail -30
pnpm --filter mobile test 2>&1 | tail -30
pnpm lint 2>&1 | tail -30
```

Expected, as measured on 2026-09-19 at commit `926fae9`:

- `pnpm type-check`: 5 tasks successful, 5 total
- `pnpm --filter mobile test`: 17 suites passed, 152 tests passed
- `pnpm lint`: record the actual result

Confirm these numbers rather than assuming them — if the counts differ, the branch has moved and the new numbers are the baseline. If anything is red, that is inherited baseline and goes in the ledger's `Baseline` section as such — not fixed here unless a sweep finding lands on it.

- [ ] **Step 3: Build and launch the app on the target device**

```bash
cd /Users/chance/projects/diamondos/.claude/worktrees/ios-mobile-app-dev-bd7875/apps/mobile
pnpm ios --device "iPad Pro 11-inch (M5)" 2>&1 | tail -40
```

Expected: build succeeds and the app launches in the attached panel. `ios/` is already prebuilt with Pods installed, so this should be an incremental build.

If the build fails, that is finding `S0` — log it and fix it under Task 10 before any sweeping, because nothing else can proceed.

- [ ] **Step 4: Create the ledger file**

```bash
cd /Users/chance/projects/diamondos/.claude/worktrees/ios-mobile-app-dev-bd7875
cat > docs/superpowers/specs/2026-09-19-ios-phase-3-findings.md <<'EOF'
# iOS Phase 3 — Findings Ledger

**Device:** iPad Pro 11-inch (M5), iOS 26.5 (`470FA5DE-B47C-4CA5-BB02-F1837E344141`)
**Data:** `diamondos-prod` under the shakedown protocol
**Spec:** [design](2026-09-19-ios-phase-3-ui-and-scorekeeping-audit-design.md)

IDs continue phase 2's scheme: `S` severe, `H` high, `M` medium.

## Baseline

Gate state before any phase 3 change:

- `pnpm type-check`: <fill from Step 2>
- `pnpm --filter mobile test`: <fill from Step 2>
- `pnpm lint`: <fill from Step 2>

## Shakedown rows created

| Game id | opponent_name | Created | Torn down |
|---------|---------------|---------|-----------|

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
**Evidence:** screenshot path / accessibility-tree excerpt / offending DB row
**Cause:** file:line (once known)
**Defect bar:** which of the three tests it meets — wrong record | blocks task | misleads
-->
EOF
```

Then replace the three `<fill from Step 2>` placeholders with the actual output captured in Step 2.

- [ ] **Step 5: Verify no placeholders remain**

```bash
cd /Users/chance/projects/diamondos/.claude/worktrees/ios-mobile-app-dev-bd7875
grep -n "fill from Step" docs/superpowers/specs/2026-09-19-ios-phase-3-findings.md
```

Expected: no output. If any line matches, fill it before committing.

- [ ] **Step 6: Commit**

```bash
cd /Users/chance/projects/diamondos/.claude/worktrees/ios-mobile-app-dev-bd7875
git add docs/superpowers/specs/2026-09-19-ios-phase-3-findings.md
git commit -m "$(cat <<'MSG'
docs: scaffold iOS phase 3 findings ledger with gate baseline

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 2: Write and verify the shakedown teardown runbook

The sweep writes to the only live environment. Teardown must be a verified query, not an intention. This task builds it and proves it is correct *before* any synthetic row exists, so the cleanup path is never improvised under time pressure at the end.

**Files:**
- Create: `docs/superpowers/runbooks/shakedown-teardown.md`

**Interfaces:**
- Consumes: nothing.
- Produces: the inventory query (`SHAKEDOWN` row census, used as the Task 12 exit gate) and the ordered delete sequence used after Tasks 8 and 11.

- [ ] **Step 1: Discover which tables a scored game actually touches**

Run via Supabase MCP `execute_sql` against `diamondos-prod`. This is read-only.

```sql
-- Every table with an FK to games, and its ON DELETE behaviour.
select
  tc.table_name,
  kcu.column_name,
  rc.delete_rule
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
  on kcu.constraint_name = tc.constraint_name
join information_schema.referential_constraints rc
  on rc.constraint_name = tc.constraint_name
join information_schema.constraint_column_usage ccu
  on ccu.constraint_name = tc.constraint_name
where tc.constraint_type = 'FOREIGN KEY'
  and ccu.table_name = 'games'
order by tc.table_name;
```

Expected: a row per dependent table — at minimum `game_events`, `game_lineups`, `game_rsvps`, `game_reconciliations`. Record each one's `delete_rule`. Tables with `CASCADE` clean themselves up when the game is deleted; anything with `NO ACTION` or `RESTRICT` must be deleted explicitly, in dependency order, before the game row.

- [ ] **Step 2: Confirm the inventory query returns zero before the sweep starts**

```sql
select id, team_id, opponent_name, status, created_at
from games
where opponent_name like 'SHAKEDOWN%'
order by created_at;
```

Expected: **zero rows.** If any rows come back, they are residue from phase 2 — do not delete them silently. Report them to the owner and get a decision first.

- [ ] **Step 3: Account for guest players, which outlive the game**

Mobile can create guest-only player identities offline (`createLocalGuest` in `apps/mobile/src/features/lineup/local-guest.ts`). Those land in `players` and `league_players`, not under `games`, so deleting the game does **not** remove them.

```sql
-- Guest-only identities, newest first. Anything the sweep creates will
-- appear here and must be named in teardown explicitly.
select p.id, p.first_name, p.last_name, p.team_id, p.created_at
from players p
where p.created_at > now() - interval '1 day'
order by p.created_at desc
limit 50;
```

Expected: a snapshot of pre-sweep state. Save the returned ids into the runbook as the "already existed, do not delete" list.

- [ ] **Step 4: Write the runbook**

Create `docs/superpowers/runbooks/shakedown-teardown.md` containing, with no abbreviation:

1. The **pre-flight census** — Step 2's query and the requirement that it return zero before a sweep begins.
2. The **pre-existing guest snapshot** — Step 3's query plus the concrete id list it returned, labelled do-not-delete.
3. The **ordered delete sequence**, derived from Step 1's actual `delete_rule` results. Explicit deletes first for any non-cascading child table, then the game. Template, to be specialised with Step 1's findings:

```sql
-- Substitute the recorded game id. One game per teardown; never a LIKE
-- pattern in a DELETE, so a typo cannot widen the blast radius.
delete from game_events   where game_id = '<recorded-uuid>';
delete from game_lineups  where game_id = '<recorded-uuid>';
delete from game_rsvps    where game_id = '<recorded-uuid>';
delete from games         where id = '<recorded-uuid>';
```

4. The **guest cleanup** — delete by explicit id list only, never by predicate.
5. The **post-teardown verification**, which is Step 2's query again, expected to return zero rows.

Write the rule explicitly in the runbook: **deletes target a recorded primary key, never a `LIKE` pattern.** The `SHAKEDOWN` prefix is for *finding* rows; ids are for *deleting* them.

- [ ] **Step 5: Commit**

```bash
cd /Users/chance/projects/diamondos/.claude/worktrees/ios-mobile-app-dev-bd7875
git add docs/superpowers/runbooks/shakedown-teardown.md
git commit -m "$(cat <<'MSG'
docs: add verified shakedown teardown runbook for prod sweeps

Deletes target recorded primary keys, never a LIKE pattern, so a typo
cannot widen the blast radius. Includes the pre-existing guest-player
snapshot that teardown must not touch.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 3: Pass A sweep — sign-in and the four top-level tabs

**Routes 1–6:** `(auth)/sign-in`, `(tabs)/index`, `(tabs)/schedule`, `(tabs)/games/index`, `(tabs)/roster/index`, `(tabs)/messages/index`.

**Files:**
- Modify: `docs/superpowers/specs/2026-09-19-ios-phase-3-findings.md`

**Interfaces:**
- Consumes: the ledger from Task 1; the attached simulator panel.
- Produces: ledger findings with IDs, and the sweep-progress table filled for routes 1–6.

- [ ] **Step 1: Run the per-route checklist on each of the six routes, in landscape**

For each route, in order, perform every check. Use `action: "inspect"` to read the accessibility tree before asserting what a screen contains or what state a control is in — never infer from a screenshot or from memory of similar apps. Use `action: "screenshot"` for colour, imagery, and layout.

Per route:

1. **First paint** — navigate to it from a cold app launch. Does it render? Does a slow load look like loading, or like breakage?
2. **Empty state** — does absence of data read as absence, or as an error?
3. **Offline** — enable airplane mode, reload the route, disable it. Does the app recover, and does it say what is wrong while offline?
4. **Layout** — anything clipped, anything behind a safe-area inset, any content that requires a scroll which pushes something else out of view. This is the phase 2 H2 class.
5. **Dynamic Type** — set the largest accessible text size in Settings, revisit. What breaks?
6. **Tap targets** — any control whose `frame` from `inspect` is smaller than 44×44 points, or that overlaps another.
7. **Keyboard** — on any route with a text input, does the keyboard cover the field it serves, and is there a way to dismiss it?
8. **Navigation** — back out. Can the route trap you?
9. **Dark mode** — switch the simulator to dark and revisit. Resolves spec open question #4: if the app has *no* dark-mode support, absent support is a feature request and drops out of scope; if it *half*-supports it — unreadable text, a light-mode panel inside a dark screen — that is a misleading state and is in scope. Record which of the two it is in the ledger on the first route, then apply that conclusion to the rest.
10. **Role gating** — what does a non-coach see? RLS is the real boundary and the UI gate is cosmetic, so the check is whether the UI shows a control the backend will reject. See Step 4 for how far this goes.

For dark mode:

```bash
xcrun simctl ui 470FA5DE-B47C-4CA5-BB02-F1837E344141 appearance dark
# restore:
xcrun simctl ui 470FA5DE-B47C-4CA5-BB02-F1837E344141 appearance light
```

For airplane mode:

```bash
xcrun simctl status_bar 470FA5DE-B47C-4CA5-BB02-F1837E344141 override --dataNetwork hide --wifiMode failed
# restore:
xcrun simctl status_bar 470FA5DE-B47C-4CA5-BB02-F1837E344141 clear
```

Note the status-bar override only changes the *indicator*. To actually sever the network, background the app and toggle the host's connectivity, or use the Simulator's own network-link conditioner. Record which method was used for each offline finding so the repro is reproducible.

- [ ] **Step 2: Repeat all ten checks on all six routes in portrait**

Rotation is driven from the Simulator UI (Device ▸ Rotate) or the simulator control tool's panel. Note that the Simulator is a tier-restricted host app, so it cannot receive synthetic key presses — do not try to rotate with `cmd+←`. Record for each route whether portrait introduced a finding landscape did not.

- [ ] **Step 3: Decide how far role-gating coverage goes, and record it**

Resolves spec open question #5. The sweep runs on one signed-in coach account, so checking what a *player* or *parent* sees requires a second prod account.

Decide by cost: if the team already has a non-coach account whose credentials the owner can supply, use it and sweep the role-gated routes twice. If it would mean **creating** an account, do not — creating accounts is out of bounds for this work. Instead, verify the gate by reading the RLS policies and the client-side role checks, and record in the ledger that role gating was verified statically rather than by observation, so the limit of the evidence is visible.

Either way, write the decision and its reasoning into the ledger. Do not leave the question open.

- [ ] **Step 4: Log every finding that clears the defect bar**

Append one entry per finding to the ledger's `## Findings` section using the format comment verbatim. Save each screenshot to the scratchpad and reference its path in `Evidence`.

Do not log a finding that fails all three defect-bar tests. Do not fix anything yet — this task's only deliverable is the ledger.

- [ ] **Step 5: Fill the sweep-progress table for routes 1–6**

Mark landscape and portrait complete, and list each route's finding IDs.

- [ ] **Step 6: Commit**

```bash
cd /Users/chance/projects/diamondos/.claude/worktrees/ios-mobile-app-dev-bd7875
git add docs/superpowers/specs/2026-09-19-ios-phase-3-findings.md
git commit -m "$(cat <<'MSG'
docs: log pass A findings for sign-in and top-level tabs

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 4: Pass A sweep — detail routes

**Routes 7–11:** `(tabs)/messages/[channelId]`, `(tabs)/practices/index`, `(tabs)/practices/[practiceId]/card`, `(tabs)/practices/[practiceId]/attendance`, `(tabs)/games/[gameId]/attendance`.

**Files:**
- Modify: `docs/superpowers/specs/2026-09-19-ios-phase-3-findings.md`

**Interfaces:**
- Consumes: the ledger; the ID sequence continues from Task 3 — do not restart numbering.
- Produces: ledger findings for routes 7–11 and their sweep-progress rows.

- [ ] **Step 1: Run the identical ten-check per-route checklist from Task 3, Step 1, on all five routes in landscape**

The checklist is the same ten checks: first paint, empty state, offline, layout, Dynamic Type, tap targets, keyboard, navigation, dark mode, role gating. Apply it in full — do not skip checks on the assumption a detail route is simpler.

Two route-specific additions:

- **`messages/[channelId]`** — send a message and confirm it appears. Check that an announcement channel (coach-post-only) does not offer a composer to a role that cannot post. Check keyboard behaviour with the composer focused, since this is the route most likely to have the keyboard cover its own input.
- **`games/[gameId]/attendance`** — RSVP is online-only on mobile with no WatermelonDB mirror, so the offline check matters more here than anywhere else. Confirm that going offline produces an honest message rather than a silent no-op or a write that appears to succeed and is lost.

- [ ] **Step 2: Repeat all five routes in portrait**

- [ ] **Step 3: Log every finding that clears the defect bar, continuing the ID sequence**

- [ ] **Step 4: Fill the sweep-progress table for routes 7–11**

- [ ] **Step 5: Commit**

```bash
cd /Users/chance/projects/diamondos/.claude/worktrees/ios-mobile-app-dev-bd7875
git add docs/superpowers/specs/2026-09-19-ios-phase-3-findings.md
git commit -m "$(cat <<'MSG'
docs: log pass A findings for message, practice, and attendance routes

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 5: Pass A sweep — lineup and the cold scoring screen

**Routes 12–13** in their pre-game state. The scoring screen before a game starts is a genuinely different layout from the screen mid-game — phase 2's H2 was exactly that difference, where the modifiers pane fit before the pitch-count strip appeared and clipped after. So the cold state gets its own pass.

**Files:**
- Modify: `docs/superpowers/specs/2026-09-19-ios-phase-3-findings.md`

**Interfaces:**
- Consumes: the ledger; ID sequence continues from Task 4.
- Produces: ledger findings for routes 12–13 cold, and a note in the ledger recording whether mobile's missing game-*detail* route is a defect or acceptable.

- [ ] **Step 1: Run the ten-check checklist on `games/[gameId]/lineup`, both orientations**

Route-specific additions: reorder the batting order and confirm the change persists across a navigate-away-and-back; confirm the offline-first lineup sync does not lose the reorder; open the guest picker and confirm it lists `league_players` identities.

- [ ] **Step 2: Run the ten-check checklist on `games/[gameId]/score` for a game that has not started, both orientations**

Do not start the game. The deliverable here is the cold-state layout only: is the full strike-zone grid reachable, are all nine zones visible, are the pitch-type controls and the zone grid simultaneously usable, and does any partial state read as complete.

- [ ] **Step 3: Decide the missing game-detail route**

Web has a game-detail page; mobile jumps from the games list straight into score/lineup/attendance. Determine by observation whether a coach can reach everything they need without it. Record the conclusion in the ledger either as a finding (if it blocks or misleads) or as an explicit "not a defect" note with the reasoning, so the question is closed rather than left open.

- [ ] **Step 4: Log findings and fill the sweep-progress table for routes 12–13**

- [ ] **Step 5: Commit**

```bash
cd /Users/chance/projects/diamondos/.claude/worktrees/ios-mobile-app-dev-bd7875
git add docs/superpowers/specs/2026-09-19-ios-phase-3-findings.md
git commit -m "$(cat <<'MSG'
docs: log pass A findings for lineup and pre-game scoring screen

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 6: Pass B — create the shakedown game and run the lineup wizard

First half of the hot walk. Ends with a real game in `in_progress` and a populated batting order, verified in the database.

**Files:**
- Modify: `docs/superpowers/specs/2026-09-19-ios-phase-3-findings.md`

**Interfaces:**
- Consumes: the teardown runbook from Task 2; the ledger.
- Produces: the shakedown game's `id`, recorded in the ledger's `Shakedown rows created` table before any event is scored. Tasks 7, 8, and 11 all operate on that id.

- [ ] **Step 1: Confirm the pre-flight census is clean**

Run the inventory query from the Task 2 runbook.

Expected: zero rows. Do not proceed if it returns anything.

- [ ] **Step 2: Create the game from the app, with a `SHAKEDOWN` opponent name**

Drive the app's own game-creation flow. Set `opponent_name` to `SHAKEDOWN 2026-09-19 pass B`.

If mobile still has no game-creation UI, that is a finding in its own right (phase 2 logged it as H3) — log it, then create the game on web or via SQL to unblock the rest of the pass, and note in the ledger which path was used.

- [ ] **Step 3: Record the game id in the ledger immediately**

```sql
select id, team_id, opponent_name, status, created_at
from games
where opponent_name like 'SHAKEDOWN%';
```

Write the returned `id` into the `Shakedown rows created` table and commit that edit **before scoring anything.** This is the step that makes teardown possible if the pass is interrupted.

- [ ] **Step 4: Commit the recorded id**

```bash
cd /Users/chance/projects/diamondos/.claude/worktrees/ios-mobile-app-dev-bd7875
git add docs/superpowers/specs/2026-09-19-ios-phase-3-findings.md
git commit -m "$(cat <<'MSG'
docs: record shakedown game id before scoring begins

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

- [ ] **Step 5: Run the lineup wizard end to end**

Complete every wizard step. Include at least one guest player, so the guest path and its `players` / `league_players` residue are both exercised.

- [ ] **Step 6: Verify the wizard actually wrote a lineup**

```sql
select batting_order, player_id, is_guest, position, count_toward_stats
from game_lineups
where game_id = '<recorded-uuid>'
order by batting_order;
```

Expected: one row per batter, contiguous `batting_order` starting at 1, with the guest row carrying `is_guest = true`. Phase 2's H1 was zero rows here, so this is the specific regression to confirm closed.

- [ ] **Step 7: Confirm the order rail and "up next" are correct on screen**

Use `inspect` to read the rail. Expected: the order matches the query, and advancing past batter 1 shows batter 2 without any mid-game "+ Batter" prompt.

- [ ] **Step 8: Log findings and commit**

```bash
cd /Users/chance/projects/diamondos/.claude/worktrees/ios-mobile-app-dev-bd7875
git add docs/superpowers/specs/2026-09-19-ios-phase-3-findings.md
git commit -m "$(cat <<'MSG'
docs: log pass B findings for game creation and lineup wizard

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 7: Pass B — score the game through every in-play path

**Files:**
- Modify: `docs/superpowers/specs/2026-09-19-ios-phase-3-findings.md`

**Interfaces:**
- Consumes: the shakedown game id from Task 6.
- Produces: ledger findings for the scoring screen mid-game, each correctness claim backed by a verified `game_events` row.

- [ ] **Step 1: Score at least two full innings each way**

Exercise every path the UI offers, and keep a written tally as you go of what you tapped — the tally is what the row verification in Step 3 is checked against:

hit (single/double/triple/home run), strikeout (swinging and called), walk, hit by pitch, groundout, flyout, error, fielder's choice, sacrifice fly, sacrifice bunt, double play, wild pitch, passed ball, balk, courtesy runner, pinch hitter, pitching change, guest player plate appearance, a runner outcome that diverges from auto-advance (thrown out advancing, and held), and a hit location captured through the field pop-up.

- [ ] **Step 2: Check the mid-game layout while scoring**

The pitch-count strip is present now, which is what changed the layout in phase 2's H2. Confirm all nine strike zones remain reachable, the pitch-type row stays visible, and the scroll affordance (`modifiers-scroll-hint`) appears only when the pane genuinely overflows.

- [ ] **Step 3: Verify the event log matches what you tapped**

```sql
select sequence_number, event_type, payload, created_at
from game_events
where game_id = '<recorded-uuid>'
order by sequence_number;
```

Check specifically, since each was a phase 2 defect or a documented invariant:

- every ball put in play has a preceding `PITCH_THROWN` with `outcome: 'in_play'`, **ordered before** its outcome event
- hit-by-pitch emits `PITCH_THROWN` with `outcome: 'hit_by_pitch'`
- sacrifice events appear only where `outs < 2`, and sac fly only with a runner on 2nd or 3rd and a fly-ball/line-drive/pop-up trajectory
- runner outcomes are separate `BASERUNNER_OUT` / `BASERUNNER_ADVANCE` events whose `relatedEventId` points at the parent play
- batted balls carry `sprayX`/`sprayY` and `fieldingSequence`; home runs carry no fielder; a skipped location prompt writes no batted-ball keys
- `sequence_number` is contiguous with no gaps

Any mismatch between the tally and the rows is a **Severe** finding — it is the "wrong record" test, directly.

- [ ] **Step 4: Confirm the sacrifice gate at 2 outs by attempting it**

Get to 2 outs and check whether Sac Fly and Sac Bunt are offered. Expected: neither is offered. Both being hidden is the phase 2 S3 fix holding; either appearing is a regression and a Severe finding.

- [ ] **Step 5: Log findings and commit**

```bash
cd /Users/chance/projects/diamondos/.claude/worktrees/ios-mobile-app-dev-bd7875
git add docs/superpowers/specs/2026-09-19-ios-phase-3-findings.md
git commit -m "$(cat <<'MSG'
docs: log pass B scoring findings with verified event rows

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 8: Pass B — correction, end game, finalize, and teardown

**Files:**
- Modify: `docs/superpowers/specs/2026-09-19-ios-phase-3-findings.md`

**Interfaces:**
- Consumes: the scored shakedown game from Task 7.
- Produces: ledger findings for the play feed, void/re-record, and finalize paths; and a torn-down database.

- [ ] **Step 1: Void and re-record a play from an earlier inning**

Open the play feed, scroll back to an inning-1 play, void it, and re-record it correctly. Confirm on screen that state, outs, baserunners, and the line score all recompute.

- [ ] **Step 2: Verify the void was append-only**

```sql
select sequence_number, event_type, payload->>'voidedEventId' as voided_event_id
from game_events
where game_id = '<recorded-uuid>'
  and event_type = 'EVENT_VOIDED'
order by sequence_number;
```

Expected: an `EVENT_VOIDED` row per void, pointing at the original, and the **original row still present and unmodified**. If any original row was deleted or updated, that is a Severe finding against the append-only invariant.

- [ ] **Step 3: End the game and confirm it finalizes**

```sql
select id, status, completed_at, home_score, away_score
from games
where id = '<recorded-uuid>';
```

Expected: `status = 'completed'`, `completed_at` not null, and the scores matching the tally from Task 7. Phase 2's S2 was this never happening; `EXPO_PUBLIC_API_BASE_URL` is set now, so it should. If it does not, capture whether the failure is honest on screen — a silent failure is a separate finding from the failure itself.

- [ ] **Step 4: Log findings**

- [ ] **Step 5: Tear down, following the runbook exactly**

Execute the ordered delete sequence from `docs/superpowers/runbooks/shakedown-teardown.md` against the recorded id, then the guest cleanup by explicit id list.

- [ ] **Step 6: Verify teardown left nothing behind**

```sql
select count(*) as remaining from games where opponent_name like 'SHAKEDOWN%';
```

Expected: `0`. Also re-run the guest query from the runbook and confirm only the pre-existing do-not-delete ids remain.

- [ ] **Step 7: Mark the game torn down in the ledger and commit**

```bash
cd /Users/chance/projects/diamondos/.claude/worktrees/ios-mobile-app-dev-bd7875
git add docs/superpowers/specs/2026-09-19-ios-phase-3-findings.md
git commit -m "$(cat <<'MSG'
docs: log pass B correction and finalize findings; confirm teardown clean

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 9: Triage the ledger and check in with the owner

The sweep is done. This task turns the ledger into an ordered work list and enforces the overrun escape hatch.

**Files:**
- Modify: `docs/superpowers/specs/2026-09-19-ios-phase-3-findings.md`

**Interfaces:**
- Consumes: the complete ledger from Tasks 3–8.
- Produces: a `## Fix order` section listing every finding ID in execution order — all `S`, then all `H`, then all `M`. This list is the set of Task 10 instances.

- [ ] **Step 1: Re-check every finding against the defect bar**

For each entry, confirm its `Defect bar` line names one of the three tests. Any finding that cannot name one is a preference — delete the entry rather than carrying it.

- [ ] **Step 2: Confirm severities are calibrated against phase 2**

Severe means a wrong record, lost data, or a game that cannot complete (phase 2 S1, S2). High means blocked or misled without data corruption (phase 2 H2). If a severity does not match its calibration point, change it.

- [ ] **Step 3: Group findings that share one cause**

Two symptoms with one root cause are one fix and one commit. Merge their entries and note both symptoms, so the commit count matches the cause count rather than the symptom count.

- [ ] **Step 4: Write the `## Fix order` section**

List every open finding ID in execution order, with its severity and one-line symptom. This is the definitive work list.

- [ ] **Step 5: Apply the overrun escape hatch**

```bash
cd /Users/chance/projects/diamondos/.claude/worktrees/ios-mobile-app-dev-bd7875
grep -c '^### [SHM][0-9]' docs/superpowers/specs/2026-09-19-ios-phase-3-findings.md
```

If the count exceeds 25: **stop.** Present the ledger to the owner for prioritisation before any fixing begins. Do not narrow the scope unilaterally — the spec commits to renegotiating explicitly rather than quietly deferring.

- [ ] **Step 6: Commit**

```bash
cd /Users/chance/projects/diamondos/.claude/worktrees/ios-mobile-app-dev-bd7875
git add docs/superpowers/specs/2026-09-19-ios-phase-3-findings.md
git commit -m "$(cat <<'MSG'
docs: triage phase 3 findings into severity-ordered fix list

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 10: The fix loop — run once per finding, in `## Fix order`

**This task is a template that executes once per ledger entry.** Its instances are named by Task 9's `## Fix order` list. Work strictly in that order: all Severe, then all High, then all Medium.

**Files (per instance):**
- Modify: the file named in the finding's `Cause` line
- Create: a test file under `packages/shared/src/rules/__tests__/` (rule defects) or `apps/mobile/src/features/<area>/__tests__/` (component and emission defects)
- Modify: `docs/superpowers/specs/2026-09-19-ios-phase-3-findings.md` — flip `Status: open` to `Status: fixed`

**Interfaces:**
- Consumes: one ledger entry, with its repro, evidence, and cause.
- Produces: one commit containing one failing-then-passing test plus its fix, and a ledger entry marked fixed.

- [ ] **Step 1: Reproduce the finding in the simulator**

Follow the entry's `Repro` steps from a cold launch. If it does not reproduce, do not fix it — mark the entry `Status: not reproducible` with what you observed instead, and move to the next finding. A fix for a bug you cannot see is a guess.

- [ ] **Step 2: Decide where the fix belongs**

Three possibilities, and picking wrong is how the phase 2 seam re-opens:

- **It is a baseball rule** (eligibility, scoring attribution, what counts as what) → `packages/shared/src/rules/`, as a pure function over `GameState` + `LeagueScoringSettings`. Both clients call it. Never a mobile JSX conditional.
- **It is an event-emission bug** (wrong payload, missing event, wrong order) → the mobile emission path under `apps/mobile/src/features/scoring/`.
- **It is presentation** (layout, focus, copy, empty state, tap target) → the component. Which leads to Step 3.

- [ ] **Step 3: If the cause is inside `score.tsx` or `PitchInput.tsx`, extract the region first**

`score.tsx` is 3,430 lines and `PitchInput.tsx` is 1,843. Phase 2 planned to decompose them incrementally and they grew instead, so extraction is a **precondition of the fix, not a follow-up**.

Extract only the region this fix touches into `apps/mobile/src/features/scoring/`, as its own component or hook with an explicit props interface. Commit the extraction as a pure move with no behaviour change:

```bash
cd /Users/chance/projects/diamondos/.claude/worktrees/ios-mobile-app-dev-bd7875
pnpm --filter mobile test 2>&1 | tail -10   # must be unchanged from baseline
git add -A
git commit -m "$(cat <<'MSG'
refactor(mobile): extract <Component> from score.tsx ahead of <ID> fix

Pure move, no behaviour change.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

Then fix inside the extracted, testable unit.

- [ ] **Step 4: Write the failing test**

The test must fail for the reason the finding describes. **A test that would have passed against the buggy code is worthless**, and this is the specific trap for layout findings: React Native Testing Library performs **no real layout**, so rendering a component and asserting an element is present cannot detect clipping — the element is present either way.

For layout defects, fire synthetic layout events with chosen dimensions and assert the behaviour tracks them. `apps/mobile/src/features/scoring/__tests__/pitch-input-modifiers-overflow.test.tsx` is the reference implementation of this technique; read it before writing a layout test. The shape:

```tsx
import { render, fireEvent, screen } from '@testing-library/react-native';
import { PitchInput } from '../PitchInput';

// `baseProps()` is the full required-props factory defined at the top of
// pitch-input-modifiers-overflow.test.tsx. Copy it from there — PitchInput
// takes ~25 required callbacks and omitting one throws at render.

/** Fires the layout event RN would emit if the container measured to `height`. */
function layoutTo(height: number) {
  fireEvent(screen.getByTestId('modifiers-scroll-view'), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width: 300, height } },
  });
}

/** Matches the real onContentSizeChange(width, height) signature. */
function contentSizeTo(height: number) {
  fireEvent(screen.getByTestId('modifiers-scroll-view'), 'contentSizeChange', 300, height);
}

it('shows the hint once measured content exceeds the container', () => {
  render(<PitchInput {...baseProps()} trackPitchType trackPitchLocation />);
  layoutTo(150);      // pane squeezed
  contentSizeTo(320); // content needs more
  expect(screen.getByTestId('modifiers-scroll-hint')).toBeTruthy();
});
```

Test the **boundary**, not just the happy case: content exactly equal to container must *not* trigger an overflow affordance, because an exactly-fitting pane getting a false-positive hint is its own defect.

For rule defects, write the test in `packages/shared` where the existing 50 test files already run, covering each boundary of the rule (0/1/2 outs, each base state, each trajectory).

For emission defects, assert the **exact event sequence and payload**, including order — `jest.setup.js` mocks `expo-crypto.randomUUID` with a deterministic counter reset per test, so ids are predictable and assertable.

- [ ] **Step 5: Run the test and confirm it fails for the right reason**

```bash
cd /Users/chance/projects/diamondos/.claude/worktrees/ios-mobile-app-dev-bd7875
pnpm --filter mobile test -- <test-file-path> 2>&1 | tail -20
# rule tests:
pnpm --filter @baseball/shared test -- <test-file-path> 2>&1 | tail -20
```

Expected: FAIL, with a message describing the finding's actual symptom. If it fails for an unrelated reason — a missing mock, a bad import — fix the test, not the code, and re-run until the failure is the real one.

- [ ] **Step 6: Write the minimal fix**

Change only what makes the test pass. No adjacent cleanup, no opportunistic refactoring beyond the Step 3 extraction.

- [ ] **Step 7: Run the test and the full suite**

```bash
cd /Users/chance/projects/diamondos/.claude/worktrees/ios-mobile-app-dev-bd7875
pnpm --filter mobile test -- <test-file-path> 2>&1 | tail -20
pnpm test 2>&1 | tail -20
```

Expected: the new test PASSES, and no previously passing test regressed.

- [ ] **Step 8: Re-verify in the simulator**

Rebuild, run the finding's `Repro` steps again, and confirm the symptom is gone. For scoring findings, re-verify the database row too — a green test on a mocked component is not evidence that the real app writes the right row.

A green test with a symptom still visible on screen means the test does not cover the defect. Return to Step 4.

- [ ] **Step 9: Commit**

```bash
cd /Users/chance/projects/diamondos/.claude/worktrees/ios-mobile-app-dev-bd7875
git add -A
git commit -m "$(cat <<'MSG'
fix(mobile): <one-line symptom from the ledger entry>

Finding <ID>. <What was wrong, and why the fix is where it is.>

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

- [ ] **Step 10: Flip the ledger entry to fixed**

Update `Status: open` to `Status: fixed` and add the fixing commit's SHA. Commit the ledger edit with the next finding's work, or on its own if this was the last one.

---

### Task 11: Regression shakedown — prove the fixes compose

Individually-verified fixes can still conflict. This task re-runs the full hot walk against the fixed app.

**Files:**
- Modify: `docs/superpowers/specs/2026-09-19-ios-phase-3-findings.md`

**Interfaces:**
- Consumes: all fixes from Task 10 instances; the teardown runbook.
- Produces: a `## Regression pass` ledger section recording the result, and either zero new findings or new entries that loop back through Task 10.

- [ ] **Step 1: Confirm the pre-flight census is clean**

Run the inventory query. Expected: zero rows — Task 8's teardown should have left nothing.

- [ ] **Step 2: Create a second shakedown game and record its id before scoring**

Use `opponent_name` = `SHAKEDOWN 2026-09-19 regression`. Record the id in the ledger and commit that edit first, exactly as in Task 6.

- [ ] **Step 3: Repeat the full Task 6–8 hot walk**

Lineup wizard with a guest, two innings each way through every in-play path, void and re-record from an earlier inning, End Game, finalize.

- [ ] **Step 4: Spot-check every Severe and High finding's repro**

For each `S` and `H` entry in the ledger, walk its `Repro` steps once more on the rebuilt app. Expected: none reproduce.

- [ ] **Step 5: Verify the rows one final time**

Re-run the Task 7 Step 3 and Task 8 Step 3 queries. Expected: pitch events present and correctly ordered for every in-play ball, contiguous sequence numbers, originals preserved through voids, `status = 'completed'` with `completed_at` set, scores matching the tally.

- [ ] **Step 6: Log any new findings and loop them through Task 10**

A fix that broke something else is a new finding with a new ID, not an amendment to the old entry. Keeping them distinct is what makes the ledger an accurate record of what this phase did.

- [ ] **Step 7: Tear down and verify clean**

Follow the runbook. Confirm `select count(*) from games where opponent_name like 'SHAKEDOWN%'` returns `0`, and that only pre-existing guest ids remain.

- [ ] **Step 8: Commit**

```bash
cd /Users/chance/projects/diamondos/.claude/worktrees/ios-mobile-app-dev-bd7875
git add docs/superpowers/specs/2026-09-19-ios-phase-3-findings.md
git commit -m "$(cat <<'MSG'
docs: record phase 3 regression shakedown result and clean teardown

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 12: Gates, review, and pull request

**Files:**
- Modify: `CLAUDE.md` — only if this phase added an environment variable, command, or domain concept
- Modify: `docs/superpowers/specs/2026-09-19-ios-phase-3-findings.md` — final status

**Interfaces:**
- Consumes: the whole branch.
- Produces: a green-gated PR against `main`.

- [ ] **Step 1: Confirm every ledger entry is resolved**

```bash
cd /Users/chance/projects/diamondos/.claude/worktrees/ios-mobile-app-dev-bd7875
grep -n "Status: open" docs/superpowers/specs/2026-09-19-ios-phase-3-findings.md
```

Expected: no output. Every entry reads `fixed`, `not reproducible`, or `won't fix` — and any `won't fix` must have been renegotiated with the owner, per the spec.

- [ ] **Step 2: Confirm all 13 routes were actually swept in both orientations**

Read the ledger's `## Sweep progress` table. Expected: every one of the 13 rows has both the landscape and portrait columns marked complete. This is spec exit criterion 1 — an unswept route means the "fix everything found" claim covers less than the app.

- [ ] **Step 3: Run all three gates**

```bash
cd /Users/chance/projects/diamondos/.claude/worktrees/ios-mobile-app-dev-bd7875
pnpm test 2>&1 | tail -30
pnpm type-check 2>&1 | tail -30
pnpm lint 2>&1 | tail -30
```

Expected: all green, and no worse than the Task 1 baseline on any inherited failure.

- [ ] **Step 4: Confirm the prod census is zero**

```sql
select count(*) as remaining from games where opponent_name like 'SHAKEDOWN%';
```

Expected: `0`. This is a hard exit criterion — the branch does not open a PR with synthetic rows live in prod.

- [ ] **Step 5: Verify the WatermelonDB schema invariant held**

```bash
cd /Users/chance/projects/diamondos/.claude/worktrees/ios-mobile-app-dev-bd7875
git diff main -- apps/mobile/src/db/schema.ts apps/mobile/src/db/migrations.ts
```

If `schema.ts`'s `version` changed, confirm `migrations.ts` gained a matching step. A bump without a migration wipes every device's unsynced offline events — do not open the PR until this is satisfied.

- [ ] **Step 6: Update `CLAUDE.md` if the phase changed anything it documents**

Only if a fix added an environment variable, a command, or a domain concept. If nothing changed, skip — do not manufacture an edit.

- [ ] **Step 7: Run CodeRabbit review**

Required by `CLAUDE.md` after implementing a feature. Address its findings; use the `superpowers:receiving-code-review` skill for anything that looks technically questionable rather than implementing it reflexively.

- [ ] **Step 8: Open the pull request**

```bash
cd /Users/chance/projects/diamondos/.claude/worktrees/ios-mobile-app-dev-bd7875
git push -u origin claude/ios-phase-3-ui-scorekeeping-c1f158
gh pr create --base main --title "fix(mobile): iOS phase 3 — UI and scorekeeping shakedown" --body "$(cat <<'BODY'
## What

Hands-on simulator sweep of all 13 iOS routes on an iPad Pro 11-inch (M5),
plus two full hand-scored games against `diamondos-prod` under the shakedown
protocol. Every defect found is fixed here with a regression test.

- Design: `docs/superpowers/specs/2026-09-19-ios-phase-3-ui-and-scorekeeping-audit-design.md`
- Plan: `docs/superpowers/plans/2026-09-19-ios-phase-3-ui-and-scorekeeping.md`
- Findings ledger: `docs/superpowers/specs/2026-09-19-ios-phase-3-findings.md`

## Why this shape

Phase 2 made the scorer's output correct through static audits. Layout, focus,
gesture, and empty-state defects are invisible to static analysis, so phase 3's
instrument is driving the app by hand. Each finding is one commit: one symptom,
one cause, one fix, one test.

Regions of `score.tsx` (3,430 lines) and `PitchInput.tsx` (1,843) were extracted
to `features/scoring/` as a precondition of editing them, rather than as a
deferred follow-up — phase 2 deferred it and the files grew.

## Verification

- `pnpm test`, `pnpm type-check`, `pnpm lint` green
- Two full shakedown games scored, finalized, and torn down
- Zero `SHAKEDOWN%` rows remaining in prod

🤖 Generated with [Claude Code](https://claude.com/claude-code)
BODY
)"
```

- [ ] **Step 9: Read CI and report**

Use the `ccd_pr` tools to read CI status rather than polling `gh`. Report the actual result — if anything is red, say so with the output.
