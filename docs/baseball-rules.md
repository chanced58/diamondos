# Baseball Rules Reference — Major League Baseball Official Baseball Rules

> **Purpose.** This document is an in-repo reference for the rules that govern how this app records, scores, and validates baseball events. It summarizes the **Official Baseball Rules (OBR)** published annually by Major League Baseball and the Office of the Commissioner, and maps each rule relevant to our code to the concrete event types, state transitions, and compliance checks implemented in `packages/shared` and the app workspaces.
>
> **Source of truth.** Major League Baseball, *Official Baseball Rules* (current edition). The canonical PDF is published by MLB at [img.mlbstatic.com/mlb-images/.../atcjzj9j7wrgvsm8wnjq.pdf](https://img.mlbstatic.com/mlb-images/image/upload/mlb/atcjzj9j7wrgvsm8wnjq.pdf) and the searchable rule-by-rule page is at [mlb.com/glossary/rules](https://www.mlb.com/glossary/rules). All citations in this document use the canonical section numbering (e.g. "OBR 5.09(b)(6)") so readers can cross-check against the PDF.
>
> **Scope notice.** MLB OBR is the *default* ruleset this reference follows. The app also supports high-school (NFHS), Little League, and NCAA rules — *Appendix C* summarizes the places where those rulesets diverge from OBR on topics relevant to scorekeeping. Where NFHS / LL / NCAA differs meaningfully (pitch counts, courtesy runners, dropped-third-strike eligibility, extra-inning runner, mercy rule), both sets of rules are described.
>
> **What this document is not.** It is not a substitute for OBR itself, is not legal counsel, and is not a coaching manual. It does not quote OBR verbatim; summaries are written in original prose with pointers to the section number. When in doubt, read the rulebook.

---

## Contents

- [Preamble & Notation](#preamble--notation)
- [Definitions of Terms](#definitions-of-terms)
- [Rule 1 — Objectives of the Game](#rule-1--objectives-of-the-game)
- [Rule 2 — The Playing Field](#rule-2--the-playing-field)
- [Rule 3 — Equipment and Uniforms](#rule-3--equipment-and-uniforms)
- [Rule 4 — Game Preliminaries](#rule-4--game-preliminaries)
- [Rule 5 — Playing the Game](#rule-5--playing-the-game)
  - [5.01 Starting the Game](#501-starting-the-game)
  - [5.02 Fielding Positions](#502-fielding-positions)
  - [5.03 Base Coaches](#503-base-coaches)
  - [5.04 Batting](#504-batting)
  - [5.05 When the Batter Becomes a Runner](#505-when-the-batter-becomes-a-runner)
  - [5.06 Running the Bases](#506-running-the-bases)
  - [5.07 Pitching](#507-pitching)
  - [5.08 How a Team Scores](#508-how-a-team-scores)
  - [5.09 Making an Out](#509-making-an-out)
  - [5.10 Substitutions and Pitching Changes](#510-substitutions-and-pitching-changes)
  - [5.11 Designated Hitter](#511-designated-hitter)
  - [5.12 Calling "Time" and Dead Balls](#512-calling-time-and-dead-balls)
- [Rule 6 — Improper Play, Illegal Action, and Misconduct](#rule-6--improper-play-illegal-action-and-misconduct)
- [Rule 7 — Ending the Game](#rule-7--ending-the-game)
- [Rule 8 — The Umpire](#rule-8--the-umpire)
- [Rule 9 — The Official Scorer](#rule-9--the-official-scorer)
  - [9.01 General Duties](#901-general-duties)
  - [9.02 Official Score Report Format](#902-official-score-report-format)
  - [9.03 Official Score Report — Additional Rules](#903-official-score-report--additional-rules)
  - [9.04 Runs Batted In (RBI)](#904-runs-batted-in-rbi)
  - [9.05 Base Hits](#905-base-hits)
  - [9.06 Game-Winning RBI (Historical)](#906-game-winning-rbi-historical)
  - [9.07 Stolen Bases and Caught Stealing](#907-stolen-bases-and-caught-stealing)
  - [9.08 Sacrifices](#908-sacrifices)
  - [9.09 Putouts](#909-putouts)
  - [9.10 Assists](#910-assists)
  - [9.11 Double and Triple Plays](#911-double-and-triple-plays)
  - [9.12 Errors](#912-errors)
  - [9.13 Wild Pitches and Passed Balls](#913-wild-pitches-and-passed-balls)
  - [9.14 Bases on Balls](#914-bases-on-balls)
  - [9.15 Strikeouts](#915-strikeouts)
  - [9.16 Earned Runs and Runs Allowed](#916-earned-runs-and-runs-allowed)
  - [9.17 Winning and Losing Pitcher](#917-winning-and-losing-pitcher)
  - [9.18 Saves for Relief Pitchers](#918-saves-for-relief-pitchers)
  - [9.19 Shutouts](#919-shutouts)
  - [9.20 Statistics](#920-statistics)
  - [9.21 Percentage Records](#921-percentage-records)
  - [9.22 Minimum Standards for Individual Championships](#922-minimum-standards-for-individual-championships)
  - [9.23 Guidelines for Cumulative Performance Records](#923-guidelines-for-cumulative-performance-records)
- [Appendix A — Quick Reference Tables](#appendix-a--quick-reference-tables)
- [Appendix B — App EventType ↔ OBR Citation Map](#appendix-b--app-eventtype--obr-citation-map)
- [Appendix C — NFHS, Little League, and NCAA Variants](#appendix-c--nfhs-little-league-and-ncaa-variants)

---

## Preamble & Notation

The Official Baseball Rules are reviewed and amended each offseason by the Playing Rules Committee, composed of representatives of MLB, the MLBPA, and other baseball stakeholders. The document is organized into nine numbered rules ("chapters") plus a front-matter **Definitions of Terms** section. Within each chapter, rules are cited with dotted decimals — the rule number, a two-digit subsection, and an optional paragraph/subparagraph. For example, **OBR 5.09(a)(3)** means "Rule 5, subsection .09 (*Making an Out*), paragraph (a) (*Retiring the Batter*), subparagraph (3)."

Throughout this document:

- **"OBR ##.##"** cites the Official Baseball Rules.
- **"NFHS"** — the National Federation of State High School Associations Baseball Rules (used by almost all US high schools).
- **"NCAA"** — NCAA Baseball Rules (used by US college baseball).
- **"Little League"** — Little League Baseball Official Regulations and Playing Rules.
- An **at-bat (AB)** is a subset of a **plate appearance (PA)**; see [§9.20](#920-statistics) for exact definitions.
- **"The fielder's choice case"** is a recurring anchor scenario throughout this doc because of its central importance to several sections and to this app's scoring logic.

OBR is promulgated in the US and is the rule of play in Major League Baseball, Minor League Baseball, and the bulk of international professional play. Significant structural overhauls occurred in 2015 (renumbering from the legacy 2.00/3.00/... structure to the current 1.00–9.00 structure) and in 2023 (pitch clock, shift restrictions, larger bases). Always consult the current year's edition for the live rules.

---

## Definitions of Terms

OBR places its **Definitions of Terms** section at the front of the rulebook, ahead of Rule 1. The definitions are alphabetical and binding — every defined term carries its defined meaning throughout the rest of the rules. Selected terms most relevant to this app (paraphrased; see OBR for exact text):

- **Appeal** — the act of a fielder claiming a rules violation by the offensive team. Appeals require a live ball, proper recipient fielder, and (typically) verbal claim to an umpire. Common triggers: missing a base, leaving a base early on a tag-up, batting out of order. See [§5.09(c)](#509-making-an-out).
- **Base** — one of four points the batter-runner must touch in order to score: first, second, third, home.
- **Base on Balls (BB / walk)** — an award of first base granted when the pitcher throws four pitches outside the strike zone that the batter does not strike at. See [§5.05(b)(1)](#505-when-the-batter-becomes-a-runner).
- **Batter** — the offensive player whose turn it is to bat.
- **Batter-Runner** — the batter from the instant they complete their time at bat until they are put out or their opportunity to run further is extinguished.
- **Batter's Box** — the designated rectangular area on either side of home plate in which the batter must stand when taking a pitch.
- **Battery** — the pitcher and catcher together.
- **Bunt** — a batted ball not swung at, but intentionally met with the bat and tapped slowly within the infield.
- **Called Game** — a game terminated by the umpire for any reason.
- **Catch** — the act of a fielder securely holding a batted or thrown ball with a hand or glove, provided the fielder does not use their cap, glove-off, mask, or other outside object or a teammate's body. A fielder must maintain possession long enough to prove the ball is controlled and, for a tag-up legality determination, the catch is complete the instant the ball settles.
- **Catcher** — the defensive player positioned directly behind home plate.
- **Coach** — team member in uniform designated to direct plays or stationed in a base coach's box.
- **Dead Ball** — a ball out of play because of a legally-created suspension of play. No runner may advance and no play can be made.
- **Designated Hitter (DH)** — a batter designated to hit in place of the starting pitcher. MLB adopted the universal DH in 2022 so the DH applies in both leagues.
- **Double Header** — two regulation games between the same clubs on the same day.
- **Double Play** — a play by the defense in which two offensive players are put out as a result of continuous action, providing there is no error between the putouts.
- **Fair Ball** — a batted ball that settles on fair ground between home and first or between home and third, or that is on or over fair ground when bounding to the outfield past first or third, or that touches first, second, or third base, or that first falls on fair ground on or beyond first or third base, or that while over fair territory passes out of the playing field in flight.
- **Fair Territory** — that part of the playing field within, and including, the first- and third-base foul lines from home plate out to the back of the playing field.
- **Fielder** — any defensive player.
- **Fielder's Choice** — the act of a fielder who handles a fair grounder and, instead of throwing to first base to put out the batter-runner, throws to another base in an attempt to put out a preceding runner. Also covers (1) the advance of the batter-runner who takes an extra base when the fielder attempts to put out another runner; and (2) the advance of a runner (other than by stolen base or error) while a fielder attempts to put out another runner. **The batter is not credited with a base hit when reaching on a fielder's choice** — even though they reached safely; see [§9.05(a)(3)](#905-base-hits). This app records that outcome as a `HIT` event with `fieldersChoice: true` preceded by a `BASERUNNER_OUT` event; stats modules ignore the hit credit but still count a PA and an AB. Further discussion: [§5.09 commentary on fielder's choice](#509-making-an-out) and [§9.05](#905-base-hits).
- **Fly Ball** — a batted ball that goes high in the air in flight.
- **Force Play** — a play in which a runner loses the right to occupy a base because of the batter becoming a runner.
- **Forfeited Game** — a game declared ended by the umpire-in-chief and awarded 9-0 to the non-offending team.
- **Foul Ball** — a batted ball that settles on foul territory between home and first or home and third, or bounds past first or third on or over foul territory, or first falls on foul territory beyond first or third, or while on or over foul territory touches a person, object, or the ground.
- **Foul Territory** — part of the playing field outside the first- and third-base foul lines extended to the fence and perpendicularly upward.
- **Foul Tip** — a batted ball that goes sharp and direct from the bat to the catcher's hands and is legally caught. A foul tip is a strike. If not caught, it's a foul ball.
- **Ground Ball** — a batted ball that rolls or bounces close to the ground.
- **Home Team** — the team on whose grounds the game is played. Bats second (bottom of each inning).
- **Illegal (Illegally)** — contrary to these rules.
- **Illegal Pitch** — (1) a pitch delivered to the batter when the pitcher does not have their pivot foot in contact with the pitcher's plate, or (2) a quick return pitch. An illegal pitch when runners are on base is a balk.
- **Infield Fly** — a fair fly ball (not including a line drive or an attempted bunt) that can be caught by an infielder with ordinary effort, when first and second, or first, second, and third bases are occupied, with fewer than two out. The batter is automatically out; runners may advance at their own risk. See [§5.09(a)(5)](#509-making-an-out).
- **Infielder** — a fielder who occupies a position in the infield (1B, 2B, 3B, SS, pitcher, catcher).
- **In Flight** — a batted, thrown, or pitched ball that has not yet touched the ground or some object other than a fielder.
- **Inning** — that portion of a game in which both teams have batted and made three outs each (or the home team has taken the lead in the bottom of the final inning).
- **Interference** — an act by an offensive player, umpire, spectator, or coach that illegally alters the play. See Rule 6 for detail by type (offensive, defensive, umpire, spectator).
- **In Jeopardy** — a term indicating the ball is alive and can be the subject of a play.
- **In the Strike Zone** — meets the definition of a strike (over any part of home plate, between the hollow beneath the batter's kneecap and the midpoint between the shoulders and the top of the uniform pants, as the batter assumes a normal batting stance).
- **Line Drive** — a batted ball that goes sharp and direct from the bat to a fielder without touching the ground.
- **Live Ball** — a ball in play.
- **Manager** — a person appointed by the club to be responsible for the team's actions on the field, and to represent the team in communications with the umpire and opposing team.
- **Obstruction** — the act of a fielder who, while not in possession of the ball and not in the act of fielding it, impedes the progress of any runner. The ball is dead at the point of obstruction; runners are awarded the base(s) they would have reached. See [§6.01(h)](#rule-6--improper-play-illegal-action-and-misconduct).
- **Offense** — the team (or player) whose turn it is to bat.
- **Official Scorer** — the appointed judge of scoring rulings. See [§9.01](#901-general-duties).
- **Out** — a call by an umpire that a batter or runner has been retired.
- **Outfielder** — a fielder stationed in the outfield (LF, CF, RF).
- **Overslide / Oversliding** — the act of an offensive player who, as a runner, slides so far beyond the base that they lose contact with it.
- **Passed Ball** — see [§9.13](#913-wild-pitches-and-passed-balls). A pitch that, in the official scorer's judgment, should have been held or controlled with ordinary effort by the catcher, and which allows a runner to advance.
- **Person** (of a player/umpire) — clothing and equipment touching the body.
- **Pitch** — a ball delivered to the batter by the pitcher.
- **Pitcher** — the fielder so designated to deliver the pitch.
- **"Pivot Foot"** — the pitcher's foot that is in contact with the pitcher's plate as the pitch is delivered.
- **Play** — an umpire's order to start the game or to resume action following a dead ball.
- **Quick Return** — an illegal pitch delivered before the batter has been given a chance to take a position in the batter's box or take a normal stance.
- **Regulation Game** — see [§7.01](#rule-7--ending-the-game). Nine innings, or five if the game is called due to weather (4.5 if the home team is ahead).
- **Retouch** — the act of a runner returning to a base legally.
- **Run (Score)** — the score made by an offensive player who advances from batter to runner and touches first, second, third, and home base in that order.
- **Run-Down** — the act of the defense attempting to put out a runner who is between two bases.
- **Runner** — an offensive player who is advancing toward, touching, or returning to a base.
- **"Safe"** — a declaration by the umpire that a runner is entitled to the base they are trying for.
- **Set Position** — one of two legal pitching positions. The pitcher faces the batter with pivot foot in contact with the rubber and comes set (complete stop) before delivering. The other legal position is the windup.
- **Squeeze Play** — a bunt play with a runner on third attempting to score.
- **Strike** — a legal pitch when so called by the umpire. See [§5.09(a)(1)–(3)](#509-making-an-out) and the Strike Zone definition.
- **Strike Zone** — the area over home plate between the hollow beneath the kneecap (bottom) and the midpoint between the top of the shoulders and the top of the uniform pants (top). Determined by the batter's stance as they prepare to swing.
- **Suspended Game** — a game that cannot be completed but will be resumed at a later date. See [§7.02](#rule-7--ending-the-game).
- **Tag** — the action of a fielder touching a base with the ball, or touching a runner with the ball or with the hand or glove holding the ball, in a firm and secure manner.
- **Throw** — an act of propelling the ball toward a teammate, distinguished from a pitch (which is a delivery to the batter).
- **Tie Game** — a regulation game called when each team has the same number of runs.
- **Time** — the announcement by an umpire of a legal suspension of play, during which the ball becomes dead.
- **Touch** — making contact with a person or object.
- **Triple Play** — a play in which the defense puts out three offensive players as a result of continuous action, providing there is no error between the putouts.
- **Wild Pitch** — see [§9.13](#913-wild-pitches-and-passed-balls). A pitch so high, so low, or so wide of the plate that it cannot be handled with ordinary effort by the catcher, and which allows a runner to advance.
- **Windup Position** — a legal pitching position in which the pitcher stands with both feet on the ground, with the pivot foot in contact with the pitcher's plate and the free foot free. The pitcher may take one step back and one step forward; they must deliver the pitch without interruption.

---

## Rule 1 — Objectives of the Game

OBR Rule 1 ("Objectives of the Game" — sometimes paired with "The Game" in the table of contents) states the **shape** of a baseball game in broad strokes.

**1.01 — The Game.** Baseball is a game between two teams of nine players each, under direction of a manager, played on an enclosed field in accordance with these rules under jurisdiction of one or more umpires.

**1.02 — Game Objective.** The offensive team's objective is to have its batters become runners and its runners advance around the bases to score runs. The defensive team's objective is to prevent them from doing so and to put them out. When a side has recorded three outs, the teams change sides. The team that has scored the most runs at the end of a regulation game wins the game.

**1.03 — Regulation Game Length.** Nine innings, with exceptions spelled out in [§7.01–7.02](#rule-7--ending-the-game). An inning ends when three outs are recorded against the side at bat, except that the home team does not bat in the bottom of the ninth if it is ahead.

**1.04 — Winning by Scoring More Runs.** The team winning after a regulation game is the one with the most runs scored. Tie games are completed to a winner per [§7.01](#rule-7--ending-the-game) (extra innings, or the "Manfred Runner" automatic runner in the 10th inning as of 2023, for regular season MLB games).

**App mapping.** The app uses `Game` as its scheduling primitive; `game_events` is the event sourcing log that replays into the live score, outs, and inning state. A game that has had a `GAME_START` event recorded is considered live. See `packages/shared/src/types/game.ts`.

---

## Rule 2 — The Playing Field

OBR Rule 2 governs field geometry. Most provisions are not relevant to scoring software and are summarized briefly here.

**2.01 — Layout of the Field.** The infield is a 90-foot square (60-foot sides in Little League Majors). Home plate, first, second, and third form the corners. The pitcher's plate ("rubber") is at 60 ft 6 in from the back of home (46 ft in LL Majors; 60 ft 6 in in NFHS and NCAA). Foul lines extend from home plate through first and third to the outfield fence.

**2.02 — Home Base.** A five-sided slab of whitened rubber 17 inches wide at the front.

**2.03 — The Bases.** Starting 2023, MLB enlarged the bases to 18-inch squares (previously 15 inches). NFHS, NCAA, and LL continue to use 15-inch bases as of this writing. Bases are secured to the ground.

**2.04 — The Pitcher's Plate.** A rubber slab 24 inches long by 6 inches wide.

**2.05 — Benches.** Each club has a bench not fewer than 25 feet from the baselines, within the dugout. Players not in the game must remain on the bench unless warming up, coaching, or batting.

**Field dimensions summary table:**

| Spec | MLB | NCAA | NFHS | LL Majors (9–12) | LL Intermediate |
| --- | --- | --- | --- | --- | --- |
| Infield side | 90 ft | 90 ft | 90 ft | 60 ft | 70 ft |
| Pitcher's plate | 60'6" | 60'6" | 60'6" | 46 ft | 50 ft |
| Base size | 18" (2023+) | 15" | 15" | 15" | 15" |
| Outfield fence (min) | 325' L/R, 400' CF | 330' / 400' | 300' / 350' | 200' | 200' |

These are not used by the current app, but may be relevant to future field-diagram UI.

---

## Rule 3 — Equipment and Uniforms

**3.01 — The Ball.** A baseball is a sphere formed by yarn wound around a small core of cork, rubber, or similar material, covered with two strips of white horsehide or cowhide, stitched together. It weighs 5 to 5¼ ounces and is 9 to 9¼ inches in circumference.

**3.02 — The Bat.** Smooth, round stick not more than 2.61 inches in diameter at the thickest part and not more than 42 inches in length. It shall be a solid piece of wood. (Metal/composite bats are governed by NFHS and NCAA standards and are prohibited in MLB.)

- **BBCOR** (Batted Ball Coefficient of Restitution) — NFHS and NCAA standard for non-wood bats. Max BBCOR 0.50.
- **USA Bat / USSSA** — Little League and youth standards governing bat stamps and drop weights.

**3.03 — Player Uniforms.** All players on a team must wear uniforms identical in color, trim, and style. The number on a player's uniform shall be at least 6 inches high. Uniforms cannot have patterns that imitate the ball or distract the hitter.

**3.04 — Catcher's Mitt.** No more than 38 inches in circumference, no more than 15½ inches from top to bottom.

**3.05 — First Baseman's Glove.** May be leather and not more than 13 inches long from top to bottom or more than 8 inches wide across the palm.

**3.06 — Fielder's Glove.** No more than 13 inches long or 7¾ inches wide.

**3.07 — Pitcher's Glove.** Same dimension limits as the fielder's glove, plus: must be one solid color other than white or gray (no distraction patterns); no exterior marks on the glove that distract.

**3.08 — Helmets.** All batters and baserunners must wear protective helmets approved by the league. Base coaches must wear helmets in most leagues.

**3.09 — Equipment on the Field.** No equipment (gloves, bats, etc.) may be left lying on the field during play.

**3.10 — Undue Commercialization.** No extraneous logos, stickers, or unapproved equipment modifications.

**App mapping.** The app does not model equipment specs. Uniform numbers are captured in `players.uniform_number`. Bat / ball compliance is a league concern not tracked here.

---

## Rule 4 — Game Preliminaries

**4.01 — Home Plate Meeting (Plate Conference).** Before the game, the managers and umpires meet at home plate. The home manager presents official lineup cards listing starters and substitutes in batting order. The umpire-in-chief inspects both lineups, asks about ground rules, and once lineups are exchanged, the cards become **official**.

**4.02 — Lineup Cards.** Each team lists the starting nine (or ten with DH), their batting order, and defensive positions. Substitutes are listed below. The lineup is binding at the moment of exchange.

**4.03 — Ground Rules.** The home team's manager may set special ground rules not inconsistent with OBR (e.g., "ball lodged in ivy: two bases"). These must be agreed to before the game.

**4.04 — Start of Game.** The umpire calls "Play" to begin the game.

**4.05 — Weather, Field Conditions, and Starting the Game.** The home team decides whether to start a game under questionable weather. Once the game starts, umpires have sole authority to stop, suspend, or resume play.

**4.06 — Forfeit Conditions.** A game may be forfeited by an umpire for delay of game, refusal to continue, failure to field nine players, or other specified offenses. Forfeit score: 9-0.

**4.07 — Spectator Interference and Crowd Control.** If spectators enter the field or interfere with play, the umpire may call time, call a runner out for spectator interference, or forfeit the game.

**4.08 — Doubleheaders.** When two games are scheduled the same day, the start of game 2 is within 30 minutes of the end of game 1 unless otherwise set.

**App mapping.** The `GAME_START` event in `packages/shared/src/types/game-event.ts` represents the umpire's "Play" call at OBR 4.04 — it records the initial lineups for both teams, the starting pitchers, and the leadoff batters. The app does not model lineup cards directly; instead, it uses the `Lineup` table and `SUBSTITUTION` events (tracked to OBR 5.10) to evolve the batting order during the game.

---

## Rule 5 — Playing the Game

This is the single most important chapter for a scorekeeping app. Its thirteen subsections cover how the game flows from first pitch to last out. Pay special attention to [5.05](#505-when-the-batter-becomes-a-runner), [5.06](#506-running-the-bases), [5.08](#508-how-a-team-scores), and [5.09](#509-making-an-out).

### 5.01 Starting the Game

The visiting team bats first (top of the 1st inning), the home team bats second (bottom of the 1st). The starting pitcher must pitch to at least one batter before being removed except in case of injury or illness. Starting 2020, MLB's "three-batter minimum" rule requires a pitcher to face at least three batters or complete the half-inning, with injury the sole exception. This does **not** apply at the NFHS or NCAA level.

**App behavior.** On `GAME_START`, the reducer (`deriveGameState`) sets `isTopOfInning = true`, `inning = 1`, and reads the leadoff batter for both teams from the payload so that `INNING_CHANGE` events can re-seed `currentBatterId` correctly.

### 5.02 Fielding Positions

Nine defensive positions: pitcher (1), catcher (2), first baseman (3), second baseman (4), third baseman (5), shortstop (6), left fielder (7), center fielder (8), right fielder (9). The defense may station these nine anywhere on fair territory **subject to**:

- The catcher must be behind home plate.
- The pitcher must be on the pitcher's plate when delivering the pitch.
- As of 2023 (MLB only), the defensive shift is restricted: two infielders must be on each side of second base and all four infielders must have their feet in the dirt portion of the infield at the moment of pitch release. Infielders may not switch sides during an inning except in case of injury.

Infield shift restrictions do not apply at NFHS, LL, or NCAA levels.

**App behavior.** Fielding positions are captured in the `Lineup` and `substitution` data. Position numbers 1–9 are used in `fieldingSequence` arrays on `HIT`, `OUT`, and `BASERUNNER_OUT` events (e.g. `[6, 4, 3]` for a 6-4-3 double play).

### 5.03 Base Coaches

The offensive team may station two base coaches — one in the first-base coach's box, one in third — to signal runners. Coaches must be in uniform and remain in their boxes while the ball is live, with limited exceptions (e.g., fielding a dropped hat). A coach who physically assists a runner is subject to [OBR 6.01(a)(8)](#rule-6--improper-play-illegal-action-and-misconduct) interference: the runner is declared out.

### 5.04 Batting

**5.04(a) — Batting Order.**
- Each player must bat in the order listed on the lineup card. A batter who bats out of order and completes their at-bat is subject to an appeal play (see below).
- The first batter in any inning after the first is the player whose name follows the last player to complete a time at bat in the preceding inning.

**5.04(b) — The Batter's Legal Position.**
- The batter must take position in the batter's box promptly when it's their turn. As of 2023 (MLB), the **pitch clock** adds strict timing: the batter must be in the box with eyes on the pitcher by the 8-second mark (15-second clock with bases empty, 20 with runners).
- **Penalty for not being ready:** strike called against the batter. **Penalty for the pitcher delaying:** ball called.

**5.04(c) — Completing the Time at Bat.**
A batter's time at bat ends when:
1. They are put out; or
2. They become a runner under [§5.05](#505-when-the-batter-becomes-a-runner); or
3. The third out of the inning is made while the batter is still at bat, in which case the batter continues their time at bat as the first batter of the next inning.

**5.04(d) — Batting Out of Order.**
A batter bats out of order when they bat when it is not their turn. The defense must **appeal** before the next pitch (or play) to the next batter — otherwise the improper batter's actions stand. If appealed successfully before the next pitch:
- The **proper** batter is called out.
- Any advances/scores by runners during the improper at-bat are nullified.
- The batter following the "proper" batter (who was just called out) then takes their turn.

If the out-of-order at-bat itself ends in an out (the improper batter made an out), the defense may let it stand — they get the out and the order resumes with whoever would have followed the proper batter.

### 5.05 When the Batter Becomes a Runner

This is one of the most cited sections in scorekeeping. It enumerates the exact conditions under which the batter is entitled to first base (or further).

**5.05(a) — Becomes a Runner Automatically.** The batter becomes a runner when:

1. **They hit a fair ball** (single, double, triple, or home run — bases determined by how far they can advance safely).
2. **The third strike is not caught cleanly** by the catcher and (a) first base is unoccupied, or (b) first base is occupied with two out. The batter may try for first; the catcher may throw them out or retire the forced runner. (Dropped Third Strike rule.) See also NFHS variation where this rule does **not apply at the 8U/10U level**, and some modifications in LL.
3. **A fair ball strikes a runner, umpire, or pitched ball while over fair territory** (an obstruction-style case; situational).
4. **A fair ball passes a fielder** in the outfield (i.e., the batted ball reaches the outfield safely).
5. **A fair ball hits a non-infield obstruction** — part of the field rule (e.g., ball lodged in fence = book rule double).

**5.05(b) — Becomes a Runner on Entitled Award.** The batter becomes a runner and is entitled to first base (no liability to be put out) when:

1. **Four balls** have been called (base on balls / BB / walk). OBR 5.05(b)(1).
2. **Hit by Pitch (HBP)** — the batter is touched by a pitch they are not attempting to hit and did not swing at, provided the pitch is not in the strike zone and the batter made an attempt to avoid being hit. If the pitch is in the strike zone, it is a strike regardless.
3. **Catcher's Interference** — the catcher or any other fielder interferes with the batter's swing (e.g., catcher's glove touches the bat). Batter awarded first base. If all runners advance at least one base on the play, the manager may elect to accept the result of the play and decline the interference call.

**5.05(b)(4) — "Infield Fly" Rule is found in [§5.09(a)(5)](#509-making-an-out)**, not here — placed there because the outcome is *the batter being out*, not becoming a runner.

**App mapping.** Each way the batter becomes a runner corresponds to a specific event type:
- (a)(1) fair ball → `HIT` with `hitType` of single/double/triple/home_run
- (a)(2) dropped 3rd strike → `DROPPED_THIRD_STRIKE` event with outcome field
- (b)(1) walk → `WALK`
- (b)(2) HBP → `HIT_BY_PITCH`
- (b)(3) catcher's interference → `CATCHER_INTERFERENCE`
- **Fielder's choice** (not a subsection here — listed under [§9.05(a)(3)](#905-base-hits)) → `HIT` with `fieldersChoice: true`, preceded by a `BASERUNNER_OUT` that retires the forced runner

### 5.06 Running the Bases

**5.06(a) — Occupying a Base.** Two runners may not occupy the same base simultaneously. If two runners are touching the same base when tagged by a fielder, the *following runner* (the one without legal right to that base) is out.

**5.06(b) — Advancing Bases.**
- A runner acquires the right to a base by touching it before being put out. Once earned, they are entitled to that base unless compelled by force.
- A runner may be forced to advance only when the batter becomes a runner, the runner's occupied base is needed by another advancing runner, and every base between them and home is occupied. See **force plays**.
- A runner who misses a base and returns must legally retouch in reverse order. A missed base is subject to an **appeal** (defense touches the missed base with the ball).
- Leaving a base early on a caught fly ball is a **failure to tag up** — also subject to appeal. Runner is out.

**5.06(c) — When the Ball is Dead.** On a dead ball, no runner may advance beyond their legally entitled base. A runner compelled to return to a base retouches in reverse order. OBR specifies exactly which bases are awarded on various dead-ball situations:

- **Pitch touching batter (HBP)** — batter to 1st; runners advance only if forced.
- **Balk** — all runners advance one base. OBR 5.07(a) has the full balk list. See also [§5.07](#507-pitching).
- **Catcher's interference** — batter to 1st; other runners advance only if forced.
- **Thrown ball out of play** — runners awarded two bases **from the time of the pitch** on the first overthrow (pitcher to batter's box), two bases **from the time of the throw** on a fielder's throw.
- **Ball thrown by pitcher into dugout** (pitch, not a throw) — all runners advance one base.

**5.06(d) — Base Coaches Interfering with Ball.** A base coach touched by a ball in play is treated under interference rules; the runner closest to the coach may be declared out.

**App behavior.** Base state is modeled as `runnersOnBase: { first, second, third }` in `LiveGameState`, carrying the player IDs of the runners. The helpers `advanceRunners` (hit model — everyone advances N bases) and `forceAdvanceRunners` (walk/HBP model — only forced runners advance) in `game-state.ts` apply these semantics. Explicit runner movements outside those standard patterns are encoded as `BASERUNNER_ADVANCE` events with an `AdvanceReason` (wild pitch, passed ball, balk, overthrow, error, on-play, voluntary).

### 5.07 Pitching

**5.07(a) — Legal Pitching Positions.** The pitcher must take either the **windup** or the **set position** before delivering the pitch. Both begin with the pivot foot in contact with the rubber.

- **Windup.** Pitcher stands facing the batter, pivot foot on the rubber. Before delivering, the pitcher may take one step backward and one step forward with the free foot. The delivery must be continuous.
- **Set position.** Pitcher stands sideways to the batter, pivot foot parallel to the rubber. Pitcher receives the sign from the catcher while standing on the rubber, then comes to a **complete stop** with hands held together in front of the body, and delivers from that stationary position. Failure to come set with runners on base = balk.

**5.07(b) — Warm-up Pitches.** A new pitcher gets 8 warm-up pitches (MLB). NFHS: 8; NCAA: up to 8; LL: 8. The starting pitcher gets them before the first inning; relievers between-innings. Re-entering the same half-inning uses fewer.

**5.07(c) — Pitcher Delaying the Game.** Pitcher must deliver within the pitch clock. MLB 2023+: 15 seconds with bases empty, 20 with runners; batter must be ready at the 8-second mark. Violation = automatic ball (pitcher) or strike (batter).

**5.07(d) — Intentional Base on Balls (IBB).** Since 2017 MLB (and various amateur levels since), an IBB is issued by the manager signaling the umpire from the dugout; no pitches are thrown. Four balls are recorded for stats.

**5.07(e) — Prohibited Pitching Actions.**
- Applying a foreign substance (pine tar, etc.) to the ball.
- Rubbing the ball on the uniform/glove/body in any way.
- Expectorating on the ball or hands.
- Defacing or bringing the pitching hand to the mouth within the circle of the mound while the bases are occupied.
- "Quick pitch" (delivering while the batter is not ready).
- All of the above are **illegal pitches** when bases are empty (ball awarded) or **balks** when runners are on base (runners advance one base).

**5.07(f) — Balk.** A balk is an illegal motion by the pitcher with runners on base. All runners advance one base; ball is dead (MLB) or delayed-dead (NFHS). The OBR enumerates **thirteen specific balk scenarios**, including (abridged):
1. Starting the pitching motion without completing the pitch.
2. Feinting a throw to first base (legal to 2nd and 3rd; illegal to 1st since 2013 for the non-pivot-foot feint; always illegal from the rubber if it's a fake).
3. Delivering while not in contact with the rubber.
4. Throwing to an unoccupied base.
5. Pitching quick return.
6. Not coming to a complete stop in the set.
7. Dropping the ball while on the rubber.
8. Making an illegal pickoff move.

**App mapping.** Balk events are recorded as `BALK` events; the reducer advances all baserunners one base and adds the run if a runner was on 3rd. No "strike" or "ball" is recorded against the pitcher's count.

### 5.08 How a Team Scores

A run is scored when a runner legally advances to and touches first, second, third, and home in that order **and** does all of this before the third out is made.

**5.08(a) — No Run Counts If:**
1. The batter-runner is out before reaching first base (thus becoming a runner) on the same play.
2. A runner is forced out (force play) for the third out.
3. A preceding runner is declared out on an appeal play for the third out.
4. The third out is the result of the batter-runner being thrown out for not touching first or for passing a preceding runner.

The critical principle: **on any third out that is itself a force-out or that prevents the batter from legally reaching first, no run scores — even if another runner crossed the plate before the out.**

**App behavior.** The reducer's `HIT` handler (as of the recent fix covered in this audit branch) guards run scoring behind `state.outs < OUTS_PER_INNING`:

```ts
if (state.outs < OUTS_PER_INNING) {
  // count runs, advance runners
}
```

Other inning-enders are already guarded similarly (`SCORE` L154, `SACRIFICE_BUNT` L213, `SACRIFICE_FLY` L230). The companion `BASERUNNER_OUT` event (used for fielder's choice) increments outs *before* the guarded HIT logic runs, which is why the guard prevents runs-after-3rd-out in the FC case. The same guard pattern is mirrored in the stats reducers (`batting-stats.ts`, `opponent-batting-stats.ts`, `pitching-stats.ts`), each of which tracks its own `outsThisInning` and skips run attribution on the HIT event when the inning is already over. See [§9.16(b)](#916-earned-runs-and-runs-allowed) for the earned-run computation, which is independent of whether the run counted on the scoreboard.

### 5.09 Making an Out

The companion to [§5.05](#505-when-the-batter-becomes-a-runner) — it enumerates all the ways the batter and runner are retired.

**5.09(a) — Retiring the Batter.** The batter is out when:
1. **Three strikes** are called or swung through. *(Strikeout.)*
2. **A third-strike bunt is fouled off** with two strikes.
3. **A foul fly is caught** in flight, fair or foul.
4. **A batted fair ball is caught** in flight.
5. **Infield Fly Rule** — a fair fly ball can be caught by an infielder with ordinary effort when 1st-2nd or bases are loaded with less than two out. The batter is automatically out. Runners may advance at their own peril.
6. **They bunt foul on the third strike.** *(Treated as strikeout.)*
7. **They attempt to hit a third strike** and it's touched by their person (partial swing that hits the batter). Dead ball, batter out.
8. **The batter-runner is tagged** before reaching first, or first base is touched with the ball before the runner.
9. **They run outside the three-foot lane** from home to first and are hit by a thrown ball, in the umpire's judgment interfering with the play at first.
10. **Interference with a fielder making a play at home plate** — catcher has right of way to field a bunt; runner must avoid.
11. **Interfering with the catcher's attempt to throw** (except on a dropped 3rd strike) — batter out, runners return.
12. **Batter runs outside batter's box to hit the ball.**
13. **Switching sides after pitch** — batter must declare and stay on one side of the plate for the at-bat (with exceptions).

**5.09(b) — Retiring the Runner.** A runner is out when:
1. **Tagged** with the ball while not in contact with their base.
2. **Forced out** — a force play on any base.
3. **Passed by a preceding runner** who has not yet been put out.
4. **Runs more than three feet from baseline** to avoid a tag (except to avoid a fielder fielding the ball).
5. **Deliberately interferes** with a batted ball or a fielder's attempt to field.
6. **Is hit by a fair untouched batted ball** while off the base (exception: if the ball passes an infielder, then strikes the runner — runner is safe).
7. **Passes another runner** (overtakes or is overtaken).
8. **Runs bases in reverse order** for the purpose of confusing the defense.
9. **Does not retouch a base** they passed on a foul fly before returning.
10. **Fails to touch each base in order** and the missed base is appealed successfully.
11. **Fails to tag up** on a caught fly ball and is appealed against.

**5.09(c) — Appeal Plays.** Appeals must be made before the next pitch or before the defense leaves fair territory. Common appeals:
- Missing a base.
- Leaving early on a caught fly ball.
- Batting out of order.

**Fielder's Choice in OBR 5.09.** The Definitions section formally defines fielder's choice. In practice, it appears in 5.09(b) implicitly: the batter reaches first because the defense chose to put out a runner elsewhere (usually a force at 2nd). The batter-runner is *safe* at 1st, but they are still charged with an at-bat (§9.05(a)(3)) and not credited with a hit. The preceding runner is the one who records the out.

The critical edge case (handled by this app's recent fix): **if the FC out is the 3rd out of the inning, the batter still completes a plate appearance even though the batter safely reached 1st**. The lineup advances, the at-bat is recorded, and no subsequent runners move or score.

**App mapping.**
- (a)(1),(a)(6) strikeout → `STRIKEOUT` event (or `OUT` with `outType: 'strikeout'`)
- (a)(3),(a)(4) fly out → `OUT` with `outType: 'flyout'`
- (a)(5) infield fly → treated as `OUT` with `outType: 'popout'` (rule enforcement is scorer's responsibility)
- (a)(8) ground out → `OUT` with `outType: 'groundout'`
- (b)(1) runner tagged → `BASERUNNER_OUT`
- (b)(2) force play → `BASERUNNER_OUT` or `DOUBLE_PLAY` / `TRIPLE_PLAY` as appropriate
- Caught stealing (b)(1) in the context of a stolen-base attempt → `CAUGHT_STEALING`
- Pick-off → `PICKOFF_ATTEMPT` with `outcome: 'out'`
- Rundown → `RUNDOWN` with `outcome: 'out'`

### 5.10 Substitutions and Pitching Changes

**5.10(a) — Who May Substitute.** Any player listed on the lineup card or roster may be substituted. A substitute takes the batting-order position of the player replaced.

**5.10(b) — Re-Entry.** In OBR (professional), a substitute may **not** re-enter the game once removed. A starter removed likewise may not return. In NFHS (high school), a **starter** may re-enter *once* in their original batting slot. Substitutes in NFHS may not re-enter. NCAA allows one-time re-entry for starters as well.

**5.10(c) — Pitcher Substitutions.**
- The new pitcher must pitch to at least one batter (OBR) or **three** batters (MLB 2020+ three-batter minimum, excluding injury). NFHS and NCAA: one-batter minimum except in case of injury.
- The pitcher must be announced to the umpire.
- Each new pitcher may take 8 warm-up pitches.

**5.10(d) — Double Switch.** In the NL (historically) and in non-DH formats: a manager may replace the pitcher and a position player simultaneously and assign them to swapped slots in the batting order. Universal DH (MLB 2022+) has reduced the frequency of double switches, but the mechanic remains legal.

**5.10(e) — Designated Hitter Rules.** See [§5.11](#511-designated-hitter).

**5.10(f) — Pinch Hitter.** A substitute batter who replaces a batter in the lineup for the current at-bat. The pinch hitter's name replaces the replaced player's in the batting order.

**5.10(g) — Pinch Runner.** A substitute runner who replaces a runner on base. The pinch runner takes the replaced runner's place on the base and in the batting order.

**App mapping.** Substitutions are recorded as `SUBSTITUTION` events with `substitutionType` of `pinch_hitter`, `pinch_runner`, `defensive`, or `position_change`. Pitching changes are the discrete `PITCHING_CHANGE` event type. Re-entry rules are not enforced at the event-sourcing level today; the UI displays a warning for OBR re-entry violations.

### 5.11 Designated Hitter

The DH is a 10th hitter who bats in place of the pitcher but does not play defense. Rules:

- Once the DH is named, they may not be removed from the game (except via substitution).
- If the DH enters the field on defense, the team **loses the DH** for the rest of the game (the pitcher must bat from that point on, in the DH's batting slot).
- If the pitcher bats for themselves, the team may not re-name a DH in that game.
- MLB uses **Universal DH** (2022+); NFHS allows a "DH for any position" rule variation depending on state; NCAA has its own hybrid.

### 5.12 Calling "Time" and Dead Balls

**5.12(a) — Calling "Time".** Umpire calls time when:
- Weather or light conditions require stopping play.
- An umpire is injured.
- A player is injured and time is necessary.
- A coach is granted time to visit the mound or the plate conference.
- A spectator enters the field.
- A catcher is replaced mid-inning (warm-up pitches).
- Other circumstances as determined by the umpire.

**5.12(b) — Dead Ball.** The ball is dead when:
- A pitch touches the batter (HBP).
- A balk is called.
- A foul ball is not caught.
- A fair batted ball touches a runner, umpire, or a fielder before passing a fielder other than the pitcher.
- A thrown ball goes out of play.
- An umpire calls "Time" or "Foul" or "Dead Ball".

No play may be made during a dead ball; runners advance only on specific awards.

---

## Rule 6 — Improper Play, Illegal Action, and Misconduct

**6.01 — Interference, Obstruction, and Catcher Collisions.**

**6.01(a) — Batter or Runner Interference.** Interference is any act by the offensive team that impedes the defense's attempt to make a play. Penalties:
- **Batter interferes with catcher's throw** — batter is out; runners return.
- **Runner interferes with a fielder fielding a batted ball** — runner is out; batter awarded 1st; other runners return unless forced.
- **Runner interferes with a thrown ball** — runner is out; ball is dead.
- **Runner hinders a fielder attempting to field a batted ball** — runner out.
- **Deliberate kick or throw by the runner of a fair ball** — runner out.

**6.01(b) — Double Play Interference ("Take-Out Slide" Rule).** As of 2016 (MLB), a runner must attempt to make a "bona fide slide" into second base on a double-play attempt. Violations result in both the runner AND the batter being called out (automatic double play denial).

A bona fide slide requires the runner to:
1. Begin their slide before reaching the base.
2. Be able and attempting to reach the base with hand or foot.
3. Be able and attempting to remain on the base after the slide.
4. Not change their path for the purpose of initiating contact with the fielder.

**6.01(c) — Interference with a Fielder.** Covers fielder obstructing a runner. Penalties same as obstruction rule.

**6.01(d) — Umpire Interference.** When an umpire is hit by a thrown ball, or when their positioning hinders a catcher's throw, the ball becomes dead or the play is disallowed (specifics vary).

**6.01(e) — Spectator Interference.** If a spectator reaches onto the field and interferes with a live ball, the umpire imposes whatever penalty would nullify the interference (e.g., calling the batter out on a would-be home-run robbery).

**6.01(f) — Offensive Team Member Interference.** Coaches physically assisting a runner = runner out. First-base coach on the field touching a runner rounding first = runner out.

**6.01(g) — Foul Ball Interference Near the Dugout.** Batted ball hits an offensive-team equipment or personnel in foul territory = interference; runner out if relevant.

**6.01(h) — Obstruction.** The act of a fielder who, while not in possession of the ball and not in the act of fielding it, impedes the progress of a runner. Two types:
- **Type 1 (play being made on obstructed runner):** ball is immediately dead; obstructed runner awarded at least one base beyond their last legally touched base.
- **Type 2 (no play on obstructed runner):** play continues; at the end of the play, umpire assesses where the obstructed runner would have reached without the obstruction, and awards those bases.

**6.01(i) — Collisions at Home Plate ("Buster Posey Rule", 2014 MLB).** Runners may not deviate from their direct path to the plate to initiate contact with the catcher. Catchers without possession of the ball may not block the runner's path to the plate. Violation = runner out or safe (depending on which party offended).

**6.02 — Pitcher Illegal Actions.** See [§5.07(e)–(f)](#507-pitching) — balks and illegal pitches.

**6.03 — Batter Illegal Action.**
- Batter uses an illegally altered bat (pine tar past 18 inches, corked bat) — batter out. In some cases, ejection.
- Batter hits ball with one foot out of the box — batter out.
- Batter interferes with catcher's play at the plate — see 6.01(a).

**6.04 — Unsportsmanlike Conduct.**
- Arguing balls/strikes = ejection.
- Physical confrontation with umpire = ejection + suspension.
- Using abusive language = ejection.
- Staged rituals or delay tactics = warning, then ejection.

---

## Rule 7 — Ending the Game

**7.01 — Regulation Game.**
- A regulation game is nine innings (six in some youth leagues; seven in NFHS softball and some junior divisions).
- If the score is tied after nine innings, the game continues until one team has more runs at the end of a completed inning.
- **Extra-inning runner** (MLB 2020+): a runner is placed on 2nd base at the start of each half-inning in extra innings. NFHS and NCAA adopted variants (NFHS optional by state; NCAA not universally adopted).
- **Called Game**: if weather or darkness forces an end, the game is official if at least 5 innings have been played (4½ if the home team is ahead). If fewer, the game is either resumed (suspended) or replayed.

**7.02 — Suspended Game.**
- Games suspended for weather, darkness, or curfew are resumed from the point of suspension.
- The batting order, count, runners, and outs are all preserved.
- Players who were in the game may return (re-entry rules per league).

**7.03 — Forfeits.**
- Refusal to continue, refusal to take the field within 5 minutes of "Play", deliberate delay, etc. — umpire may declare forfeit. Score recorded 9-0 in favor of the non-offending team.

**7.04 — Mercy Rule (Run-Rule).**
- MLB: **no mercy rule**.
- NFHS: 10-run rule after 5 innings (or 4½ if home ahead); 15-run rule after 3 (or 2½).
- NCAA: 10-run rule after 7 innings (conference-option).
- Little League: 10-run rule after 4 innings (3½ if home ahead); 15-run rule after 3.

**App mapping.** The app's `regulation_innings` configuration per game supports 5, 6, 7, or 9 innings. Extra-inning logic is handled generically — the reducer does not advance past the configured regulation innings without an explicit `INNING_CHANGE`. Mercy rule checks are performed by `pitch-count-calculator` and reported by the coach UI.

---

## Rule 8 — The Umpire

**8.01 — Umpire Authority.** The umpire-in-chief (plate umpire) is the final authority on all judgment calls and rules interpretations on the field.

**8.02 — Appeal to the Umpire.** A manager may appeal a rules interpretation (not a judgment call) by requesting the plate umpire consult with the crew or invoke replay (MLB).

**8.03 — Umpire Jurisdiction.**
- Plate umpire (home) calls balls and strikes; primary jurisdiction on fair/foul, catches near the plate, and plays at home.
- Base umpires: plays at their respective bases.

**8.04 — Replay Review (MLB, since 2014).** Managers may challenge specific plays (fair/foul, catch/no catch, force/tag, tag-up, etc.) via one challenge per game (expandable based on usage). Strikes and balls are **not reviewable**.

**App mapping.** The app does not model umpires. Disputed calls are handled out-of-band.

---

## Rule 9 — The Official Scorer

**This is the most important chapter for the app's statistics engine.** Every statistic the app derives (batting, pitching, fielding, advanced metrics) traces back to a rule in this chapter.

### 9.01 General Duties

**9.01(a)** — The official scorer is the judge of all matters of scoring. Decisions are binding, subject only to the specific appeal mechanics in this rule.

**9.01(b)** — The scorer is independent of either team.

**9.01(c)** — Scoring decisions must be made within 24 hours after the end of the game (or next scheduled game-day).

**9.01(d)** — The scorer cannot make a decision that conflicts with OBR.

**App mapping.** The app's scorekeeper role is the "official scorer" for app-internal purposes; MaxPreps / GameChanger export reports are meant to be audit-quality, not authoritative for pro-level OBR.

### 9.02 Official Score Report Format

The scorer must prepare a game report containing:
1. Name of each player, position, batting order.
2. Plate appearances (PA), at-bats (AB), runs (R), hits (H), RBI, walks (BB), strikeouts (K), etc.
3. Pitching line for each pitcher: innings pitched (IP), hits allowed, runs allowed, earned runs (ER), BB, K, HR allowed, pitch count.
4. Fielding line: putouts (PO), assists (A), errors (E).
5. Inning-by-inning runs and total score.
6. Time of game, weather, attendance.
7. Notes on any unusual plays.

**App implementation.** Reports are rendered by the web dashboard (`apps/web/src/app/(app)/games/[gameId]/box`) and statisticians can export to MaxPreps CSV via the `maxpreps-export` edge function.

### 9.03 Official Score Report — Additional Rules

**9.03(a)** — Scorer's decisions on base hits, errors, wild pitches, passed balls, sacrifices, stolen bases/CS, and similar judgment calls are final.

**9.03(b)** — A player is credited with having played a position if they played at least one play at that position.

**9.03(c)** — Pitcher substitution recording: the scorer records the exact batter and count at which a pitcher enters and exits; this governs W/L/S decisions in [§9.17–9.19](#917-winning-and-losing-pitcher).

### 9.04 Runs Batted In (RBI)

A **Run Batted In (RBI)** is credited to a batter whose action at bat causes a run to score, **except** under the conditions in 9.04(b). The exact rules:

**9.04(a)** — Credit an RBI for a run scored:
1. **On a safe hit** (single/double/triple/HR), including the batter themselves on a home run.
2. **On a sacrifice fly** (SF).
3. **On a sacrifice bunt** (SH).
4. **On an infield out** or **fielder's choice** — if a runner scores on the out (e.g., runner on 3rd with less than 2 outs, batter hits grounder, runner scores). EXCEPTION: no RBI on a double play where the batter hits into a force out at 2nd and a runner scores.
5. **On a bases-loaded walk, HBP, or catcher's interference** — forced run counts as RBI.

**9.04(b)** — Do **not** credit an RBI when:
1. The run scores on a **wild pitch, passed ball, balk, or error** (though a hit that allows a runner already at 3rd to score counts — the scorer distinguishes hit advancement from error advancement).
2. The batter grounds into a **force double play** and a runner scores from 3rd.
3. Reached on an **error** and a runner scores from 3rd.

**9.04(c) — Judgment on RBI vs. no-RBI.** If an error occurs on what would have been the third out, and a runner scores, the scorer decides whether the batter would have driven in the run anyway (RBI) or whether the error caused the run (no RBI, treated as unearned).

**App mapping.** The `HIT` event handler in `game-state.ts` auto-derives RBI based on the hit type and the runners on base at the time of the pitch. The `SACRIFICE_BUNT` and `SACRIFICE_FLY` handlers likewise auto-credit RBI when a runner scores on the play. Walk/HBP auto-credit RBI only when bases are loaded (`walkBasesLoaded` check). Wild-pitch / balk / error runs are emitted as explicit `SCORE` events with `rbis: 0`.

### 9.05 Base Hits

**9.05(a) — Credit a Base Hit When:**
1. The batter reaches first base (or any base) safely on a fair ball that (a) settles on the ground; (b) touches a fence before being touched by a fielder; or (c) clears a fence.
2. The batter reaches first base on a fair ball hit with such force or so slowly that any fielder attempting to make a play with it has no chance to retire a runner.
3. The batter reaches safely because of a *fielder's choice* that put out a preceding runner — **NO HIT** credited.
4. The fielder unsuccessfully tries for a putout of a preceding runner — scorer's judgment on hit vs. FC (generally, hit if the force was not there or the defense misplayed).
5. The batter would have been put out except for an error — scorer's judgment.

**9.05(b) — Scorer's Judgment.** If a runner scores and the batter reaches base, the official scorer must decide whether the batter's safe arrival is due to (a) a clean hit, (b) an error, or (c) a fielder's choice. The preponderance of evidence rule applies: if the defense had a reasonable play on a preceding runner and made that choice, credit the batter with reaching on an FC. If the defense had no play anywhere, credit a hit.

**The Fielder's Choice Case — Detailed.**

The classic FC: runner on 1st, ground ball to the shortstop, SS throws to 2nd forcing the runner out, batter reaches 1st. The batter:
- Is **not** credited with a hit (§9.05(a)(3)).
- **Is** credited with an at-bat (AB).
- **Is** credited with a PA.
- Is **not** credited with an RBI (even if a runner advances from 2nd to 3rd on the play).
- Does **not** get a batting-average credit.

This is the specific encoding this app uses: a `BASERUNNER_OUT` event retires the forced runner, followed by a `HIT` event with `fieldersChoice: true`. The stats module (`batting-stats.ts`) increments `ab` and `pa` but skips `h`. The pitching module (`pitching-stats.ts`) does not credit a hit allowed. The opponent-batting module is symmetric.

**Edge case: 3rd-out FC.** If the FC is the 3rd out of the inning, the batter still completes a PA + AB — the lineup advances past this batter for the next time that team bats. The reducer's HIT handler guards runner advancement and run scoring behind `state.outs < OUTS_PER_INNING`, so no subsequent runners move and no runs score, even though the HIT event is still recorded (because the PA must still be credited and the lineup must advance). See the fix note in the "Approach" section of the audit branch for full context.

### 9.06 Game-Winning RBI (Historical)

The Game-Winning RBI statistic was an MLB official stat from 1980 to 1988, then retired. It is no longer tracked by OBR. This app does not track GWRBI. Mentioned here for completeness in case historical records reference it.

### 9.07 Stolen Bases and Caught Stealing

**9.07(a) — Stolen Base.** A runner is credited with a stolen base when they advance a base unaided by a hit, putout, error, force-out, fielder's choice, passed ball, wild pitch, or balk. Typical SB: runner breaks with the pitch, catcher throws, runner slides in safely.

**9.07(b) — Double and Triple Steals.** Each runner advancing is credited with their own SB if they meet the SB criteria on the play.

**9.07(c) — Caught Stealing (CS).** Credit a CS when a runner attempting to steal is tagged or forced out. Also credit CS when a runner overslides and is tagged, or is picked off while attempting to steal (when they broke with the pitch).

**9.07(d) — No SB When.**
- The runner advances on a wild pitch or passed ball (credited as WP or PB, not SB).
- The runner advances on a balk (credited as balk advance).
- The runner advances on defensive indifference (DI) — when the defense makes no attempt to retire the runner (typically late in a one-sided game).
- The runner advances on a throw attempting to retire another runner (credited as FC or part of the unsuccessful play).

**App mapping.** `STOLEN_BASE` event records an SB; `CAUGHT_STEALING` records a CS. `BASERUNNER_ADVANCE` with `reason: WILD_PITCH` or `PASSED_BALL` is the non-SB case. Defensive indifference is scorer-judgment; the app flags it via an optional payload field.

### 9.08 Sacrifices

**9.08(a) — Sacrifice Bunt (SH).** A batter who is put out on a bunt that advances at least one runner is credited with a sacrifice bunt. The scorer must judge that the batter's intent was to advance the runner (not to reach base). No SH if the batter is bunting to bunt for a hit. SH does not count as an AB but does count as a PA.

**9.08(b) — Sacrifice Fly (SF).** A batter who hits a fly ball that is caught and allows a runner at third to score (or a runner at second, by scorer's judgment, if the runner would have scored on the play) is credited with a sacrifice fly. SF does not count as an AB but does count as a PA.

**9.08(c) — SF Clarification.** A fly ball that would have been caught (but was dropped for an error) still counts as a SF if a runner scores. A foul fly caught that allows a runner to tag and score is a SF.

**App mapping.** `SACRIFICE_BUNT` and `SACRIFICE_FLY` events each (a) record the out, (b) advance runners per the sac model (bunt: everyone one base; fly: runner on 3rd scores), (c) auto-derive RBI if a runner scores, (d) count PA but not AB for the batter.

### 9.09 Putouts

**9.09(a) — Credit a putout** to the fielder who:
1. Catches a fly ball or line drive (the fielder who catches it gets the PO).
2. Is holding the ball when tagging a runner.
3. Is holding the ball and touches a base on a force play.
4. Is the catcher on a strikeout (including a caught 3rd strike; on an uncaught 3rd strike, PO goes to whoever records the out — usually the catcher after the throw to 1st).

**9.09(b) — Dropped Third Strike.** On a swinging/looking K3 where the ball is not caught and the batter reaches base, the *strikeout* is still credited to the pitcher. The PO goes to whoever (usually 1B or catcher on a thrown putout) records the out. If the batter safely reaches on a wild pitch K3, no PO is credited for that PA; instead, the runner becomes a baserunner who is out or safe on a subsequent play.

### 9.10 Assists

**9.10(a) — Credit an assist** to each fielder who throws, handles, or deflects a ball in such a way that a putout results, even if the contact is unintentional.

**9.10(b) — Multiple Assists.** Multiple fielders may get assists on the same play (e.g., 6-4-3 double play: SS assists throwing to 2B, 2B assists throwing to 1B, 1B gets the PO).

**9.10(c) — No Assist When.**
- A fielder takes a throw and retires a runner without throwing to another fielder (no assist, just a PO).
- The play is entirely by one fielder (e.g., catching a line drive unassisted).

**App mapping.** The `fieldingSequence` array on `HIT`, `OUT`, `BASERUNNER_OUT`, and `DROPPED_THIRD_STRIKE` events records the chain of fielders involved. The fielding-stats module (`fielding-stats.ts`) derives PO and A from this sequence: the last fielder gets the PO, all others get assists.

### 9.11 Double and Triple Plays

**9.11(a) — Double Play.** A play in which two offensive players are put out as a result of continuous action, provided no error occurs between the putouts. Common: 6-4-3 (SS to 2B to 1B force-out GIDP).

**9.11(b) — Triple Play.** Three outs from continuous action without error between putouts. Extremely rare; ~5 per MLB season.

**9.11(c) — Unassisted Triple Play.** A single fielder records all three outs without help. Historical rarity (~15 in MLB history).

**App mapping.** `DOUBLE_PLAY` and `TRIPLE_PLAY` are explicit event types. The reducer increments the out counter by 2 or 3 respectively (capped at 3). The stats module credits GIDP to the batter and increments the defense's DP/TP totals.

### 9.12 Errors

**9.12(a) — Credit an Error When:**
1. A fielder mishandles a batted ball that an average fielder at that position could have handled with ordinary effort.
2. A fielder makes a wild or late throw that allows a runner to advance one or more bases, or prevents a putout.
3. A fielder drops a routine throw.
4. A catcher fails to complete a throw on a steal attempt in a way that allows the runner to reach safely.
5. A batted ball strikes an umpire or runner; error to the fielder who would have made the play (scorer's judgment).

**9.12(b) — Do NOT Credit an Error When:**
1. The fielder attempts to turn a double play but fails to get the lead runner — no error for the "first" out that didn't happen (the batter is safe by FC).
2. The pitcher throws wild trying to get the batter (a wild pitch is separate from error).
3. A catcher's passed ball (that's a PB, not an E).
4. A fielder makes a "mental error" (e.g., throws to the wrong base) — scorer's judgment.

**9.12(c) — Error Counting.** Each fielder gets charged with each error they commit. Multiple errors on one play are possible (e.g., E6-E3).

**9.12(d) — "Wild Throw" vs. "Muffed Throw".** Both count as errors; the distinction is whose hands dropped the ball.

**App mapping.** `FIELD_ERROR` events record the batter reaching on error. Runner-advancement errors are encoded as `BASERUNNER_ADVANCE` with `reason: ERROR` or `reason: OVERTHROW`, with `errorBy` naming the fielder position.

### 9.13 Wild Pitches and Passed Balls

**9.13(a) — Wild Pitch.** Charged to the pitcher when:
1. A pitch so high, so low, or so wide of the plate that the catcher cannot control it with ordinary effort, and
2. The miss allows a runner to advance.

**9.13(b) — Passed Ball.** Charged to the catcher when:
1. A pitch that should have been held or controlled with ordinary effort by the catcher was not, and
2. The miss allows a runner to advance.

**Scorer's judgment.** The official scorer decides WP vs. PB. Key question: was the pitch in the strike zone? If yes → PB. If no → WP (usually).

**App mapping.** `PITCH_THROWN` events carry `isWildPitch` and `isPassedBall` boolean flags. Runner advances on such pitches are `BASERUNNER_ADVANCE` with `reason: WILD_PITCH` or `PASSED_BALL`.

### 9.14 Bases on Balls

**9.14(a) — Intentional Base on Balls.** Counts as a walk (BB) and is recorded in the pitcher's line as a walk. Stat split (IBB vs. regular BB) is tracked separately.

**9.14(b) — Walk Stats.** BB counts as PA but not AB. OBP formula credits walks (unlike AVG).

**App mapping.** `WALK` event. Walks on bases-loaded auto-score from 3rd and credit the batter RBI. `HIT_BY_PITCH` and `CATCHER_INTERFERENCE` are structurally similar (PA but not AB, forced-run RBI).

### 9.15 Strikeouts

**9.15(a) — Strikeout.** Credit to the pitcher on any of:
1. Three called strikes.
2. Three swinging strikes.
3. A bunt foul on the 3rd strike (batter out regardless).
4. A swinging 3rd strike that the catcher catches cleanly.

**9.15(b) — Dropped 3rd Strike.** Credit a K to the pitcher whether or not the catcher cleans it up. The batter may reach safely (if 1st is unoccupied or 2 outs) — the K still counts. This app's `DROPPED_THIRD_STRIKE` event handles three outcomes: `thrown_out`, `reached_on_error`, `reached_wild_pitch`. In all cases, the pitcher is credited with a K; whether the batter reaches is a separate play.

**9.15(c) — Foul Tip Strike 3.** A foul tip caught cleanly is a K.

**App mapping.** `STRIKEOUT` event, or `OUT` with `outType: 'strikeout'`. `DROPPED_THIRD_STRIKE` event covers the reach-on-uncaught-K3 scenarios.

### 9.16 Earned Runs and Runs Allowed

**This is one of the most complex sections in OBR.** The earned-run rules are the basis of ERA and ERA+.

**9.16(a) — Earned Run (ER) Defined.** A run charged to the pitcher is **earned** if it scores without the aid of errors or passed balls. An **unearned** run is one that would not have scored but for an error or passed ball.

**9.16(b) — Reconstructing the Inning.** When an error occurs, the scorer must reconstruct the inning as it would have progressed without the error. Outs that would have been made with no error "convert" subsequent runners: runners who reach on hits after the error-that-would-have-been-out-3 score as **unearned** (because a clean inning would have been over).

**9.16(c) — Passed Balls.** A passed ball that advances a runner who later scores makes that run unearned.

**9.16(d) — Team Unearned Runs.** Some runs are unearned to the team (would not have scored with no error), but individual pitchers may have different ER counts (e.g., a relief pitcher inheriting runners on base).

**9.16(e) — Inherited Runners.** When a pitcher is removed with runners on base, those runners are charged to the departing pitcher if they score. The replacement pitcher is charged for any new runs on batters they retired or put on base.

**9.16(f) — ERA Formula.** ERA = (Earned Runs / Innings Pitched) × 9. Innings pitched = outs / 3 (e.g., a pitcher who records 20 outs pitched 6.2 innings; ERA = ER × 9 / 6.667).

**App mapping.** The `SCORE` event has an `rbis` field that is scorer-supplied (0 for balk/WP/error-induced runs, 1–4 for earned hits). The pitching-stats module (`pitching-stats.ts`) tracks earned vs. unearned by inspecting the events that led to each run: if any `BASERUNNER_ADVANCE` or `SCORE` with `reason` including ERROR/WILD_PITCH/PASSED_BALL is in the run's chain, the run is unearned for that pitcher. The `9.16(b)` reconstruction is approximated — see the module's comments for edge cases.

### 9.17 Winning and Losing Pitcher

**9.17(a) — Winning Pitcher.** Credit a W to:
- The starting pitcher if they pitched at least 5 innings and their team took and held the lead while they were the pitcher of record.
- Otherwise, the relief pitcher who was the pitcher of record when their team took the lead that they held.

**9.17(b) — Losing Pitcher.** The pitcher of record when the opponent took a lead they did not relinquish.

**9.17(c) — Pitcher of Record.** The pitcher charged with the decision. The "pitcher of record" changes as new pitchers enter; only one pitcher per team is the PoR at any moment.

**9.17(d) — Scorer's Judgment on Effective Starter.** If a starter pitches fewer than 5 innings in a game won by their team and the relievers are equally effective, the scorer designates the most effective reliever as the winning pitcher.

**App mapping.** The pitching-stats module tracks `PITCHING_CHANGE` events and the scoring state at each change to determine W/L/S. Edge cases (the "Vulture Win" where a reliever blows a lead and then their team rescores) are correctly attributed.

### 9.18 Saves for Relief Pitchers

**9.18(a) — Credit a Save** to the relief pitcher who:
1. Is the finishing pitcher in a game won by their team.
2. Is not the winning pitcher.
3. Is credited with at least ⅓ inning pitched.
4. Satisfies one of:
   - Enters with a lead of no more than 3 runs and pitches at least 1 inning.
   - Enters with the potential tying run on base, at bat, or on deck.
   - Pitches at least 3 innings regardless of the score.

**9.18(b)** — Only one save per game.

**App mapping.** Save derivation in `pitching-stats.ts` evaluates the three 9.18(a)(4) conditions at the moment of entry.

### 9.19 Shutouts

A complete-game shutout is credited to a single pitcher who pitches all nine innings (or the full regulation length if shorter) without allowing a run. If multiple pitchers combine for a no-run game, it's a **combined shutout**, credited to the team and individually noted but not a "shutout" for any individual pitcher.

### 9.20 Statistics

Core stats and their formulas, per OBR 9.22 (qualification thresholds) and 9.20:

- **Batting Average (AVG) / (BA)** = Hits / At-Bats.
- **On-Base Percentage (OBP)** = (H + BB + HBP) / (AB + BB + HBP + SF).
- **Slugging Percentage (SLG)** = Total Bases / AB. Total Bases = 1B + 2×2B + 3×3B + 4×HR.
- **OPS** = OBP + SLG.
- **At-Bat (AB)** = PA minus (BB + HBP + SH + SF + CI).
- **Plate Appearance (PA)** = at-bats + BB + HBP + sacrifices + catcher's interference.
- **Earned Run Average (ERA)** = 9 × ER / IP.
- **Walks + Hits per Inning Pitched (WHIP)** = (BB + H) / IP.
- **Fielding Percentage (FPCT)** = (PO + A) / (PO + A + E).
- **Winning Percentage (PCT)** = W / (W + L).

**App formulas.** The stats modules in `packages/shared/src/utils/` implement each of these formulas verbatim. The `deriveBattingStats` / `deriveOpponentBatting` / `computePitchingStats` / `computeFieldingStats` functions are the single sources of truth.

### 9.21 Percentage Records

Percentages (AVG, OBP, SLG, FPCT, PCT) are carried to three decimal places: ".300", ".456", etc. Leading zero is suppressed by convention.

### 9.22 Minimum Standards for Individual Championships

A player must meet a minimum playing time to qualify for a league championship:
- **Batting:** 3.1 PA per team game scheduled (502 PA in a 162-game MLB season).
- **Pitching ERA:** 1 IP per team game scheduled (162 IP).
- **Fielding:** varies by position.

### 9.23 Guidelines for Cumulative Performance Records

- **Consecutive game hitting streak:** continues if a player is intentionally walked all PAs in a game (but does NOT continue if the player has a hitless at-bat in any other fashion). Broken by any hitless game with at least one AB.
- **Consecutive game on-base streak:** requires at least one PA per game.
- **Consecutive game playing streak:** counts any game in which the player takes the field or a PA.

---

## Appendix A — Quick Reference Tables

### A.1 — Batter Outcomes and Their Stats Credit

| Outcome | PA | AB | H | BB | K | HBP | SF/SH | RBI auto | Reached base? |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Single / Double / Triple / HR | ✓ | ✓ | ✓ | — | — | — | — | from runners who score | ✓ |
| Walk | ✓ | — | — | ✓ | — | — | — | only if bases loaded | ✓ |
| HBP | ✓ | — | — | — | — | ✓ | — | only if bases loaded | ✓ |
| Catcher's Interference | ✓ | — | — | — | — | — | — | only if bases loaded | ✓ |
| Strikeout (swinging / looking) | ✓ | ✓ | — | — | ✓ | — | — | — | — |
| Dropped 3rd Strike → out | ✓ | ✓ | — | — | ✓ | — | — | — | — |
| Dropped 3rd Strike → safe | ✓ | ✓ | — | — | ✓ | — | — | — | ✓ |
| Ground-out / Fly-out / Line-out / Pop-up | ✓ | ✓ | — | — | — | — | — | runner from 3rd on contact | — |
| Fielder's Choice | ✓ | ✓ | — | — | — | — | — | — (unless runner scored not-on-force) | ✓ |
| Sacrifice Bunt | ✓ | — | — | — | — | — | SH | runner from 3rd | — |
| Sacrifice Fly | ✓ | — | — | — | — | — | SF | runner from 3rd | — |
| Reached on Error | ✓ | ✓ | — | — | — | — | — | runner from 3rd (scorer judgment) | ✓ |
| Home Run | ✓ | ✓ | ✓ | — | — | — | — | 1 + each runner on base | ✓ (around) |
| Double Play | ✓ | ✓ (GIDP tracks separately) | — | — | — | — | — | — | — |

### A.2 — Earned Run Decision Tree

```text
Run scored
├── Did the play include any error? → No → EARNED
│                                   → Yes → continue
├── Would the run have scored with no error? → Yes → EARNED (error didn't matter)
│                                            → No → continue
├── Would the inning be over with no error?  → Yes → UNEARNED
│                                            → No → continue
└── Is the run caused by a passed ball?       → Yes → UNEARNED
                                              → No → EARNED
```

### A.3 — Hit vs. Error vs. Fielder's Choice Judgment

| Situation | Credit |
| --- | --- |
| Routine grounder to SS, SS bobbles, batter safe at 1st | Error (SS) |
| Hard line drive deflects off 3B to LF, batter safe at 1st | Hit (and no error if no fielder had a legitimate play) |
| Ground ball to SS with runner on 1st; SS throws to 2B forcing runner, batter safe | Fielder's Choice (no hit to batter) |
| Ground ball to SS with runner on 1st; SS has no play at 2B (runner too fast), throws to 1B too late | Hit to batter |
| Pop-up dropped by 2B, batter safe; 2B could have caught with ordinary effort | Error (2B) |
| Flare into the outfield gap that LF had no reasonable chance to catch | Hit |

### A.4 — Pitcher-of-Record Decision Table

| Scenario | Winning Pitcher |
| --- | --- |
| Starter goes 6 IP, leaves ahead, team holds lead | Starter |
| Starter goes 4 IP, team leads, bullpen holds | Scorer's choice (most effective reliever) |
| Starter goes 5+ IP, team trailing when starter exits, later takes lead | Relief pitcher of record when team took lead |
| Starter goes 6 IP, team ties after exit, team later wins | Relief pitcher of record when team took new lead |
| Both teams lead alternately | Pitcher of record for final lead change |

### A.5 — Sacrifice Bunt vs. Sacrifice Fly Criteria

| Criterion | Sac Bunt (SH) | Sac Fly (SF) |
| --- | --- | --- |
| Contact type | Bunt | Fly ball (caught) |
| Batter outcome | Put out | Put out |
| Runner advance required | At least one runner advances at least one base | At least one runner scores from 3rd |
| Stats impact | PA, not AB | PA, not AB |
| Common scenarios | Squeeze play, 1-2 hole runner advance | Runner on 3rd, fewer than 2 outs |

### A.6 — Double Play Notation Reference

| Code | Meaning |
| --- | --- |
| 6-4-3 | SS → 2B → 1B (force) |
| 4-6-3 | 2B → SS → 1B (force) |
| 5-4-3 | 3B → 2B → 1B (force) |
| 3-6-3 | 1B → SS → 1B (runner-back to 1B) |
| 1-6-3 | P → SS → 1B |
| 1-2-3 | P → C → 1B |
| 3U | 1B unassisted |
| 6U | SS unassisted |
| 8-6-3 | CF → SS → 1B (line drive doubled off 1st) |

### A.7 — Standard Scorebook Abbreviations (for UI reference)

| Symbol | Meaning |
| --- | --- |
| K | Strikeout looking |
| Kˢ (K swung) | Strikeout swinging |
| BB | Walk |
| IBB | Intentional walk |
| HBP | Hit by pitch |
| CI | Catcher's interference |
| 1B / 2B / 3B / HR | Single / Double / Triple / Home Run |
| FC | Fielder's Choice |
| E# | Error on fielder # |
| FO / F# | Fly out to fielder # |
| LO / L# | Line out to fielder # |
| PO / P# | Pop-up to fielder # |
| GO / G#-# | Ground out with assist sequence |
| SB / CS | Stolen base / Caught stealing |
| WP / PB | Wild pitch / Passed ball |
| BK | Balk |
| SH / SF | Sacrifice Bunt / Sacrifice Fly |
| DP / TP | Double / Triple play |
| GIDP | Grounded into double play |

---

## Appendix B — App EventType ↔ OBR Citation Map

All app-level game events in `packages/shared/src/types/game-event.ts` map to specific OBR sections. Use this table when unsure whether an app behavior is faithful to OBR.

| EventType | OBR Citation | App Handler |
| --- | --- | --- |
| `GAME_START` | §4.04 "Play" | `deriveGameState` L38 |
| `GAME_END` | §7.01 Regulation Game | client-side only |
| `INNING_CHANGE` | §5.04(c)(3), §5.08 | `deriveGameState` L265 |
| `PITCH_THROWN` | §5.04(b), §5.07(a) | `deriveGameState` L61 (ball/strike counting) |
| `PICKOFF_ATTEMPT` | §5.07(f)(10) | out increment if `outcome: 'out'` |
| `BALK` | §5.07(a)(13), §5.07(f) | advances all runners 1 base |
| `HIT` (single/double/triple/HR) | §5.05(a)(1), §9.05 | `deriveGameState` L123; RBIs auto-derived; lineup advances |
| `HIT` with `fieldersChoice:true` | §9.05(a)(3) | Same handler, but stats modules skip hit credit |
| `OUT` | §5.09(a) | `deriveGameState` L177; lineup advances |
| `STRIKEOUT` | §5.09(a)(1), §9.15 | same as OUT but K credited to pitcher |
| `WALK` | §5.05(b)(1), §9.14 | `deriveGameState` L97; forces runners |
| `HIT_BY_PITCH` | §5.05(b)(2), §9.14 | same as WALK; records as HBP not BB |
| `CATCHER_INTERFERENCE` | §5.05(b)(3) | same as WALK; PA, no AB |
| `DROPPED_THIRD_STRIKE` | §5.05(a)(2) | `deriveGameState` L186; K credited to pitcher regardless of reach/out |
| `SACRIFICE_BUNT` | §9.08(a) | `deriveGameState` L206; PA but not AB |
| `SACRIFICE_FLY` | §9.08(b) | `deriveGameState` L227; PA but not AB; scores runner from 3rd |
| `FIELD_ERROR` | §9.12 | `deriveGameState` L160; batter reaches; stats credit error to fielder |
| `DOUBLE_PLAY` | §9.11(a) | `deriveGameState` L240; 2 outs |
| `TRIPLE_PLAY` | §9.11(b) | `deriveGameState` L257; 3 outs |
| `STOLEN_BASE` | §9.07(a) | advances runner; SB credit |
| `CAUGHT_STEALING` | §9.07(c) | out; runner removed |
| `BASERUNNER_ADVANCE` | §5.06(b), §9.07(d), §9.12, §9.13 | advances runner; reason tagged |
| `BASERUNNER_OUT` | §5.09(b) | `deriveGameState` L339; single out |
| `RUNDOWN` | §5.06(b)(4), §5.09(b)(4) | out if `outcome: 'out'`; safe leaves runner on assigned base |
| `SCORE` | §5.08 | explicit run; rbis scorer-supplied; guarded by `outs < OUTS_PER_INNING` |
| `SUBSTITUTION` | §5.10(a)(f)(g) | lineup slot replaces player |
| `PITCHING_CHANGE` | §5.10(c) | current pitcher updated |
| `PITCH_REVERTED` | app-specific | undoes a pitch count |
| `EVENT_VOIDED` | app-specific | voids a prior event |

### Stats module mappings

| App stat | Module | OBR Rule |
| --- | --- | --- |
| `pa`, `ab`, `avg`, `h`, `2b/3b/hr`, `rbi`, `bb`, `k`, `hbp`, `sf`, `sh`, `sb`, `cs`, `r`, `obp`, `slg`, `ops` | `batting-stats.ts`, `opponent-batting-stats.ts` | §9.02, §9.04, §9.05, §9.07, §9.08, §9.14, §9.15, §9.20 |
| `ip`, `h`, `r`, `er`, `bb`, `k`, `hr`, `era`, `whip`, `w/l/s`, `shutout` | `pitching-stats.ts` | §9.15, §9.16, §9.17, §9.18, §9.19, §9.20 |
| `po`, `a`, `e`, `fpct`, `dp`, `tp` | `fielding-stats.ts` | §9.09, §9.10, §9.11, §9.12 |
| `pitch_count`, `rest_days`, `compliance_status` | `pitch-limits.ts`, edge fn `pitch-count-calculator` | NFHS/LL/NCAA (see Appendix C) |
| `qab` | `batting-stats.ts` (high-school specific) | NFHS extension |

---

## Appendix C — NFHS, Little League, and NCAA Variants

This app supports games played under four rulesets: **MLB OBR** (default), **NFHS**, **NCAA**, and **Little League**. They diverge on several scorekeeping-relevant points.

### C.1 — Game Length and Mercy Rule

| Rule | MLB | NCAA | NFHS | LL Majors |
| --- | --- | --- | --- | --- |
| Regulation innings | 9 | 9 | 7 | 6 |
| Called-game minimum | 5 (4½) | 5 (4½) | 4 (3½) | 4 (3½) |
| Mercy rule | None | 10-run after 7 (opt-in) | 10-run after 5 (or 4½); 15-run after 3 | 10-run after 4 (or 3½); 15-run after 3 |
| Tie-game resolution | Extra innings, "Manfred Runner" on 2B in 10th+ (regular season 2020+) | Extra innings | Extra innings | Extra innings |

### C.2 — Pitch Count and Rest

Every level imposes pitcher-safety limits. The `pitch-count-calculator` edge function applies the correct ruleset per game.

**NFHS (generic, varies by state):**
- 125 pitches/day max.
- 4-day rest required after 106+ pitches.
- 3-day rest required after 76–105 pitches.
- 2-day rest required after 51–75 pitches.
- 1-day rest required after 26–50 pitches.

**Little League (Majors 9–12):**
- 85 pitches/day max (age 11–12), 75 (9–10).
- 4 days rest after 66+ pitches.
- 3 days rest after 51–65.
- 2 days rest after 36–50.
- 1 day rest after 21–35.

**NCAA:**
- No strict pitch counts, but innings-pitched limits apply in postseason.
- Monitored by coaches; the app still tracks IP and pitch count for self-reporting.

**MLB:**
- No OBR pitch limits at the MLB level (CBA governs IL stints, etc.).

**App mapping.** `pitch-count-calculator` (Deno edge function) reads the `compliance_rules` config per team/league, sums pitches from the current game, checks prior-game pitches within the rest window, and returns a status of `available`, `warning`, `over_limit`. Client UI blocks further pitches from a pitcher at `over_limit` unless overridden with manager authorization (logged as an event).

### C.3 — Re-Entry

- **MLB:** No re-entry. Once a player is out, they cannot return.
- **NFHS:** A *starter* may re-enter once, in their original batting slot. Substitutes may not re-enter.
- **NCAA:** A starter may re-enter once.
- **LL Majors:** A starter may re-enter once, with the "mandatory play rule" (every roster player gets ≥1 PA per game) taking precedence.

### C.4 — Courtesy Runners

- **MLB:** No courtesy runners.
- **NFHS:** Courtesy runner for the pitcher or catcher allowed (once per inning per position), at any time, to speed up the game. The courtesy runner must be someone not currently in the game (or a specific permitted substitute list).
- **NCAA:** Similar to NFHS.
- **LL Majors:** Courtesy runner allowed for the catcher only with two outs.

**App mapping.** The app records courtesy runners as `SUBSTITUTION` events with `substitutionType: 'pinch_runner'` and a special "is_courtesy" flag. The original player is not removed from the game.

### C.5 — Dropped Third Strike

- **MLB / NCAA / NFHS:** Per §5.05(a)(2), batter may advance on dropped 3rd strike if 1st is unoccupied or two outs.
- **LL 8U:** Does **not** apply. Strikeout is always a strikeout regardless of catcher's drop.
- **LL 10U and up:** Same as OBR.

### C.6 — Balk (Pickoff Restrictions)

- **MLB:** 2023 rule: two-step pickoff move limit per at-bat (3rd fails → balk).
- **NCAA / NFHS:** No pickoff-attempt limit per AB.
- **LL Majors:** No pickoff-attempt limit. Bunt-back rule applies.

### C.7 — Extra-Inning Runner ("Manfred Runner")

- **MLB Regular Season 2020+:** Runner placed on 2B to start each half-inning beginning with the 10th.
- **MLB Postseason:** Not used.
- **NCAA:** Adopted 2023 as an optional rule per conference.
- **NFHS:** Varies by state; not universal.
- **LL:** Varies by tournament.

**App mapping.** When configured, the extra-inning runner is recorded as a `SUBSTITUTION` pinch-runner event at the top of the 10th half-inning, placing the player who made the last out of the prior half-inning on 2nd.

### C.8 — Quality At-Bat (QAB)

Not an OBR stat. A **Quality At-Bat** is an NFHS-level metric crediting a batter for any of:
- Hitting the ball hard, wherever it lands (line drive, sharp grounder, deep fly).
- Working the count to 6+ pitches.
- Extending an at-bat with 2 strikes (fouling off tough pitches).
- Executing a sacrifice bunt or sacrifice fly.
- Getting a hit, walk, HBP, or reaching on CI.
- Moving a runner (bunting for advancement, grounding out to the right side, etc.).

**App mapping.** The QAB derivation lives in `batting-stats.ts`; see [§9.05 + fielder's choice](#905-base-hits) for the specific rule that FC does *not* count as a QAB (covered by the explicit `fieldersChoice: true` skip in the QAB section of `batting-stats.ts`). QAB is a high-school-coach-focused metric and should not be assumed to be well-defined at other levels.

### C.9 — Designated Hitter / DH Variants

- **MLB (2022+):** Universal DH.
- **NCAA:** DH permitted, plus an optional "DP/Flex" in softball; in baseball, the DH follows OBR.
- **NFHS:** DH permitted, variable by state.
- **LL Majors:** No DH.

### C.10 — Miscellaneous Common Variations

- **Leadoff runner sliding rules.** NFHS and LL: runner may not leave the base until the pitch crosses home plate. MLB and NCAA: runner may leave at release.
- **Metal bats.** NFHS and NCAA allow BBCOR-compliant metal bats. LL allows USA Bat or USSSA stamped bats per division. MLB is wood-only.
- **Batter-box rules.** NCAA and MLB: batter must keep one foot in the box between pitches (pitch-clock enforcement). NFHS: advisory.

---

## References

- Major League Baseball. *2025 Official Baseball Rules.* MLB.com. Available at [img.mlbstatic.com/mlb-images/.../atcjzj9j7wrgvsm8wnjq.pdf](https://img.mlbstatic.com/mlb-images/image/upload/mlb/atcjzj9j7wrgvsm8wnjq.pdf) (current edition).
- MLB Glossary of Rules: [mlb.com/glossary/rules](https://www.mlb.com/glossary/rules).
- National Federation of State High School Associations. *NFHS Baseball Rules Book* (annual). [nfhs.org](https://www.nfhs.org).
- Little League Baseball. *Official Regulations and Playing Rules* (annual). [littleleague.org](https://www.littleleague.org).
- NCAA. *NCAA Baseball Rules* (odd-year editions). [ncaa.org](https://www.ncaa.org).

**Internal cross-references.**
- `packages/shared/src/utils/game-state.ts` — event → state reducer (`deriveGameState`).
- `packages/shared/src/utils/batting-stats.ts`, `opponent-batting-stats.ts` — hitting stats.
- `packages/shared/src/utils/pitching-stats.ts` — pitching stats and ERA reconstruction.
- `packages/shared/src/utils/fielding-stats.ts` — fielding stats (PO/A/E).
- `packages/shared/src/utils/pitch-count.ts`, `supabase/functions/pitch-count-calculator/` — pitch-limit compliance.
- `packages/shared/src/types/game-event.ts` — canonical event schema.
- `CLAUDE.md` — project conventions and glossary.
