# Shared Runner Advancement + Sacrifice Runner Outcomes — Design

**Date:** 2026-09-28
**Branches:** PR A `claude/runner-advancement-shared-rule` (off `main` @ 423fca1); PR B stacked on it
**Status:** Design approved (enforce OBR; two PRs) — awaiting spec review

## Problem

1. **Sacrifices have no runner control.** A sac bunt moves every runner up one
   base (squeeze scores from 3rd); a sac fly scores the runner from 3rd and
   holds everyone else. The scorer cannot record a runner holding, tagging up
   to take an extra base, or being thrown out — so the book is wrong whenever
   the play differs from the default.
2. **Existing bug: most stats consumers ignore linked runner outcomes on
   hits.** Mobile and web record a hit's per-runner outcomes as linked
   `BASERUNNER_OUT` / `BASERUNNER_ADVANCE` (+ `SCORE` for an advance home)
   events with `relatedEventId` → the `HIT`. Only `deriveGameState` and
   `batting-stats` honor them. The rest re-derive base state themselves and
   get it wrong:

   | Scenario | line-score | pitching-stats | opponent-batting | maxpreps |
   |---|---|---|---|---|
   | A. runner from 2nd **held** at 3rd on a double | +1 run; ADVANCE wipes the batter off 2nd | +1 R/ER | +1 R and RBI; can score twice | +1 R and RBI; can score twice |
   | B. runner from 2nd **advanced home** on a single (+ linked SCORE) | runs right; ghost runner left on 3rd | ghost on 3rd | correct | correct |
   | C. runner **thrown out** on a hit | +1 run | +1 R/ER | +1 R and RBI | +1 R and RBI |

   `computeLineScore` feeds the **final score written at finalize**
   (`apps/web/src/lib/games/finalize.ts:73`), the web and mobile line scores,
   game-stats loading, and dual-scorekeeper reconciliation.
   `game-history.ts` gets run counts right but leaves ghost/wiped runners in
   its running base state, and labels every linked advance "held at X",
   including advances past the standard base.

Sacrifice outcomes would hit the same consumers, so the shared rule comes first.

## Decisions

| Question | Decision |
|---|---|
| Split | **Two PRs.** A: one shared runner-advancement rule, adopted by every consumer (fixes the hit bug). B: sacrifice runner outcomes on top of it. |
| Sacrifice validity | **Enforce OBR 9.08.** A sac fly needs at least one run to score; a sac bunt needs at least one runner to advance. Otherwise the prompt says to record a regular out instead. |
| Web scoring UI | Unchanged. Web keeps recording what it records today; the shared consumers read either client's events. |

## PR A — one shared runner-advancement rule

### The rule (`packages/shared/src/rules/play-runners.ts`, new)

Extracted from `deriveGameState`, the reference implementation that is already
correct (including the #210 base-matching fixes):

- **`collectLinkedRunnerOutcomes(events)`**: groups linked
  `BASERUNNER_OUT` / `BASERUNNER_ADVANCE` events by `relatedEventId`. Matching
  is by **starting base** when the event carries `fromBase`, and by runner id
  for older events. (This is today's `buildRunnerOverrideMap`.)
- **`applyPlayToRunners(runners, play, batter, overrides, idOf)`** →
  `{ runners, scoring, runs }`. `play` is `{ kind: 'hit', bases: 1|2|3|4 }`
  in PR A. It applies the default advance to every runner without a linked
  outcome and places the batter. `scoring` lists who crossed the plate, lead
  runner first, with the batter last on a home run. `runs` counts them,
  including a home-run batter with no id. Runners with a linked outcome are
  left off; their linked events place or remove them. (This is today's
  `advanceRunnersWithOverrides` plus the run counting in the HIT case.)
- **`applyLinkedAdvance(runners, payload)`** and
  **`applyRunnerOut(runners, payload)`**: today's `deriveGameState` semantics.
  - A runner is cleared from `fromBase` only if he is still on it. An advance
    home places nothing; the linked `SCORE` event carries the run.
  - An out clears the named base. A linked out whose runner the parent play
    already dropped clears nothing. Otherwise an out falls back to the first
    base holding the runner's id (older events, and web's "Out at" editor).

Runner values are generic `T`, and `idOf` reads the id. Pitching stats'
`{ id, reachedOnError }` rides through unchanged. A runner a hit leaves to
his linked outcome is kept under `<hit id>:<starting base>`, so his
reached-on-error flag survives when the linked advance puts him back on base.

### Consumers adopt it

| Consumer | Change |
|---|---|
| `game-state.ts` | Calls the extracted functions. No behavior change. |
| `batting-stats.ts` | Uses `collectLinkedRunnerOutcomes`, so matching is by base, not id only. Uses `applyPlayToRunners` for HIT runs and placement. Linked ADVANCE/OUT use the shared helpers. |
| `line-score.ts` | HIT, BASERUNNER_ADVANCE and BASERUNNER_OUT go through the shared rule. **Fixes A/B/C.** |
| `pitching-stats.ts` | The same, keeping its `reachedOnError` earned-run logic. **Fixes A/C runs and earned runs.** Inherited-runner responsibility stays out of scope (there's none today). |
| `opponent-batting-stats.ts` | The same. RBI = `payload.rbis` when present, else `played.runs`. A linked advance moves every runner, named or not, because base state drives other batters' RBI; crediting a run still requires a name. **Fixes A/C.** |
| `game-history.ts` | Running base state uses the shared helpers. The linked-advance label says "took X" / "scored" beyond the standard base, matching the mobile play feed (`hitRunnerOptions.standardBase`). Also fixes its sac bunt handling: today it neither advances runners nor scores a squeeze run, assuming a separate `SCORE` event that neither client writes (web records only the `sacrifice_bunt` event, `ScoringBoard.tsx:1458`). Every other consumer already applies the default. |
| `supabase/functions/maxpreps-export/stats.ts` | Deno can't import `@baseball/shared` (documented at the top of `stats.ts`). `stats.ts` carries a **verbatim copy** of `play-runners.ts` between `BEGIN`/`END` marker comments. It isn't a separate file because Deno needs `.ts` import extensions, and ts-jest rejects those. `rules/__tests__/play-runners-copy.test.ts` fails unless the block matches the original byte for byte, and `runner-outcomes-consistency.test.ts` runs every scenario through `aggregateStats`. |

### Behavior preservation

Games with no linked outcomes must produce **identical** output in every
consumer. The existing suites cover this, and each consumer gets a
no-linked-outcomes case in the new scenario table.

### Tests (written first)

- **`play-runners` unit tests:** scenarios A, B and C; runners sharing an id;
  a void of the linked child (voided events are filtered before any
  consumer); an older linked event with no `fromBase`.
- **One cross-consumer table test** (`runner-outcomes-consistency.test.ts`):
  scenarios A, B, C, D (two runners sharing an id), and a no-outcome
  control. Compares runs per half, runs and RBI per batter, and pitcher runs
  allowed across game-state, line-score, batting-stats, opponent-batting,
  pitching-stats and the MaxPreps `aggregateStats`.
- **game-history:** running score after a held runner and after an advance
  home (no ghost); "took"/"scored" labels; sac bunt squeeze.

## PR B — sacrifice runner outcomes

### Options (extends the shared rule)

`play` gains `{ kind: 'sac_fly' }` and `{ kind: 'sac_bunt' }`. A new
`sacRunnerOptions(fromBase, kind, occupiedBases)` and a generalized
`evaluateRunnerOutcomes(play, runners)` (the hit version becomes a wrapper)
apply the same collision and no-passing checks as hits.

| Play | Standard | Hold | Advanced | Thrown out |
|---|---|---|---|---|
| **Sac bunt** (batter out) | up one base; the runner from 3rd scores (squeeze) | at his own base (the batter's out removes the force) | beyond one base, up to home | yes |
| **Sac fly** (batter out) | the runner from 3rd scores; runners on 1st/2nd hold | the runner on 3rd at 3rd | runners on 1st/2nd tag and move up, up to home | yes (tagging) |

**OBR 9.08 validity**, from the evaluator:
- A sac fly with no runner scoring returns the error "No run scored — record
  it as a fly out instead."
- A sac bunt with no runner advancing returns the error "No runner advanced —
  record it as an out instead."
- Confirm stays disabled while an error shows (same as hits). The existing
  eligibility gates (fewer than 2 outs, and a runner on 3rd for a sac fly)
  are unchanged.

**RBI:** `rbis` = runners scoring on the play (default and advanced), written
explicitly on the sac payload when any runner has a linked outcome, as hits
do. With no linked outcomes the payload is unchanged, so existing derivation
stands.

### Recording

The same linked events as hits:
- `BASERUNNER_OUT` with the putout `fieldingSequence`;
- `BASERUNNER_ADVANCE`;
- `SCORE { rbis: 0 }` for an advance home.

All carry `relatedEventId` → the `SACRIFICE_FLY` / `SACRIFICE_BUNT`.
`applyPlayToRunners` gains the sac kinds. PR A left each consumer's
`SACRIFICE_FLY` / `SACRIFICE_BUNT` handler applying its own default advance,
so PR B routes each of them through `applyPlayToRunners` with the play's
linked outcomes, the same way PR A did for hits: game-state, batting-stats,
line-score, pitching-stats, opponent-batting, the MaxPreps copy, and
game-history. game-history's `isLinkedWithBase` handling then holds for sac
children too, because the sac play (like a hit) leaves those runners off.
Web's own sac events still have no linked outcomes and replay as before;
the consistency test gains the sac scenarios.

### iPad flow

On Sac Fly or Sac Bunt with runners on (both the direct buttons and the
Out → "was it a sac?" path):
1. outcome;
2. field location (existing);
3. the runner-outcome prompt, the same component as hits, titled "Sac fly —
   runner outcomes";
4. the putout-order popup for each thrown-out runner, lead runner first
   (existing);
5. the batter's throw step (existing, e.g. 1-3 on a bunt);
6. record once.

With the bases empty, a sacrifice is impossible and the buttons stay gated.

### Tests (written first)

- **Shared:**
  - `sacRunnerOptions` per base and kind;
  - evaluator OBR errors, collisions and passing;
  - `applyPlayToRunners` sac defaults, plus each override (held, advanced,
    thrown out);
  - the cross-consumer table extended with sac scenarios (bunt with a runner
    held at 2nd; sac fly with the runner from 2nd tagging to 3rd; sac fly
    with the runner from 3rd thrown out at home, which must be refused
    unless another run scores).
- **Mobile component:**
  - the prompt opens for both sac paths, and not with the bases empty;
  - OBR errors disable Confirm;
  - the putout popup for a thrown-out runner;
  - the record call carries the outcomes.

## Out of scope

- Web scoring UI for sacrifice runner outcomes (and web adopting hold-at-own-base / Who's up?).
- Pitching inherited-runner responsibility (none today).
- Fielder's choice / double play runner outcomes.
