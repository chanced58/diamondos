import { derivePitchingStats } from '../pitching-stats';
import { EventType, PitchOutcome, HitType } from '../../types/game-event';

type Evt = {
  game_id: string;
  sequence_number: number;
  event_type: string;
  payload: Record<string, unknown>;
  is_top_of_inning?: boolean;
};

const GAME = 'g1';
let seq = 0;
const e = (
  event_type: string,
  payload: Record<string, unknown>,
  is_top_of_inning = true,
): Evt => ({
  game_id: GAME,
  sequence_number: seq++,
  event_type,
  payload,
  is_top_of_inning,
});
const resetSeq = () => { seq = 0; };

const players = [
  { id: 'home-p', firstName: 'Home', lastName: 'Pitcher' },
  { id: 'away-p', firstName: 'Away', lastName: 'Pitcher' },
  { id: 'relief', firstName: 'Relief', lastName: 'Arm' },
  { id: 'b1', firstName: 'Bat', lastName: 'One' },
  { id: 'b2', firstName: 'Bat', lastName: 'Two' },
  { id: 'b3', firstName: 'Bat', lastName: 'Three' },
];

describe('derivePitchingStats — real-ID game flow', () => {
  beforeEach(resetSeq);

  it('attributes K, BB, H, and IP to the correct pitcher', () => {
    const events: Evt[] = [
      e(EventType.GAME_START, { homeLineupPitcherId: 'home-p', awayLineupPitcherId: 'away-p' }),
      // Top of 1st: home-p pitching to b1
      e(EventType.PITCH_THROWN, { pitcherId: 'home-p', batterId: 'b1', outcome: PitchOutcome.SWINGING_STRIKE }),
      e(EventType.PITCH_THROWN, { pitcherId: 'home-p', batterId: 'b1', outcome: PitchOutcome.SWINGING_STRIKE }),
      e(EventType.PITCH_THROWN, { pitcherId: 'home-p', batterId: 'b1', outcome: PitchOutcome.SWINGING_STRIKE }),
      e(EventType.STRIKEOUT, { pitcherId: 'home-p', batterId: 'b1' }),
      // Walk b2
      e(EventType.PITCH_THROWN, { pitcherId: 'home-p', batterId: 'b2', outcome: PitchOutcome.BALL }),
      e(EventType.PITCH_THROWN, { pitcherId: 'home-p', batterId: 'b2', outcome: PitchOutcome.BALL }),
      e(EventType.PITCH_THROWN, { pitcherId: 'home-p', batterId: 'b2', outcome: PitchOutcome.BALL }),
      e(EventType.PITCH_THROWN, { pitcherId: 'home-p', batterId: 'b2', outcome: PitchOutcome.BALL }),
      e(EventType.WALK, { pitcherId: 'home-p', batterId: 'b2' }),
      // b3 singles; b2 is forced to 2nd
      e(EventType.PITCH_THROWN, { pitcherId: 'home-p', batterId: 'b3', outcome: PitchOutcome.IN_PLAY }),
      e(EventType.HIT, { pitcherId: 'home-p', batterId: 'b3', hitType: HitType.SINGLE }),
    ];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stats = derivePitchingStats(events as any, players);
    const s = stats.get('home-p')!;
    expect(s).toBeDefined();
    expect(s.strikeouts).toBe(1);
    expect(s.walksAllowed).toBe(1);
    expect(s.hitsAllowed).toBe(1);
    expect(s.inningsPitchedOuts).toBe(1);
    // 3 strike pitches + 4 ball pitches + 1 IN_PLAY pitch = 8
    expect(s.totalPitches).toBe(8);
    // away-p never pitched
    expect(stats.get('away-p')).toBeUndefined();
  });
});

describe('derivePitchingStats — stub recovery via GAME_START cache', () => {
  beforeEach(resetSeq);

  it('attributes IP to cached starter even when every PITCH_THROWN carries the unknown-pitcher stub', () => {
    const events: Evt[] = [
      e(EventType.GAME_START, { homeLineupPitcherId: 'home-p', awayLineupPitcherId: 'away-p' }),
      // Full inning of stub-pitched events
      e(EventType.PITCH_THROWN, { pitcherId: 'unknown-pitcher', batterId: 'b1', outcome: PitchOutcome.IN_PLAY }),
      e(EventType.OUT, { pitcherId: 'unknown-pitcher', batterId: 'b1', outType: 'groundout' }),
      e(EventType.PITCH_THROWN, { pitcherId: 'unknown-pitcher', batterId: 'b2', outcome: PitchOutcome.IN_PLAY }),
      e(EventType.OUT, { pitcherId: 'unknown-pitcher', batterId: 'b2', outType: 'flyout' }),
      e(EventType.PITCH_THROWN, { pitcherId: 'unknown-pitcher', batterId: 'b3', outcome: PitchOutcome.SWINGING_STRIKE }),
      e(EventType.PITCH_THROWN, { pitcherId: 'unknown-pitcher', batterId: 'b3', outcome: PitchOutcome.SWINGING_STRIKE }),
      e(EventType.PITCH_THROWN, { pitcherId: 'unknown-pitcher', batterId: 'b3', outcome: PitchOutcome.SWINGING_STRIKE }),
      e(EventType.STRIKEOUT, { pitcherId: 'unknown-pitcher', batterId: 'b3' }),
    ];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stats = derivePitchingStats(events as any, players);
    // Stub must never get a stats row
    expect(stats.has('unknown-pitcher')).toBe(false);
    const s = stats.get('home-p')!;
    expect(s).toBeDefined();
    expect(s.inningsPitchedOuts).toBe(3); // full inning
    expect(s.strikeouts).toBe(1);
  });

  it("after INNING_CHANGE, outs are credited to the opposite side's cached starter", () => {
    const events: Evt[] = [
      e(EventType.GAME_START, { homeLineupPitcherId: 'home-p', awayLineupPitcherId: 'away-p' }),
      // Top of 1st — home pitches
      e(EventType.PITCH_THROWN, { pitcherId: 'unknown-pitcher', batterId: 'b1', outcome: PitchOutcome.IN_PLAY }, true),
      e(EventType.OUT, { pitcherId: 'unknown-pitcher', batterId: 'b1', outType: 'flyout' }, true),
      e(EventType.OUT, { pitcherId: 'unknown-pitcher', batterId: 'b2', outType: 'groundout' }, true),
      e(EventType.OUT, { pitcherId: 'unknown-pitcher', batterId: 'b3', outType: 'flyout' }, true),
      // Inning change → bottom of 1st, away pitches
      e(EventType.INNING_CHANGE, {}, true),
      e(EventType.OUT, { pitcherId: 'unknown-pitcher', batterId: 'b1', outType: 'groundout' }, false),
      e(EventType.OUT, { pitcherId: 'unknown-pitcher', batterId: 'b2', outType: 'flyout' }, false),
      e(EventType.OUT, { pitcherId: 'unknown-pitcher', batterId: 'b3', outType: 'flyout' }, false),
    ];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stats = derivePitchingStats(events as any, players);
    expect(stats.get('home-p')!.inningsPitchedOuts).toBe(3);
    expect(stats.get('away-p')!.inningsPitchedOuts).toBe(3);
  });
});

describe('derivePitchingStats — PITCHING_CHANGE updates only the defending side cache', () => {
  beforeEach(resetSeq);

  it('replaces the home starter with relief, then INNING_CHANGE does not revert to original starter', () => {
    const events: Evt[] = [
      e(EventType.GAME_START, { homeLineupPitcherId: 'home-p', awayLineupPitcherId: 'away-p' }),
      e(EventType.OUT, { pitcherId: 'home-p', batterId: 'b1', outType: 'groundout' }, true),
      // Mid-inning pitching change to relief (top of 1st, home is defending)
      e(EventType.PITCHING_CHANGE, { newPitcherId: 'relief', outgoingPitcherId: 'home-p' }, true),
      e(EventType.OUT, { pitcherId: 'unknown-pitcher', batterId: 'b2', outType: 'flyout' }, true),
      e(EventType.OUT, { pitcherId: 'unknown-pitcher', batterId: 'b3', outType: 'flyout' }, true),
      // Inning change — away now pitches
      e(EventType.INNING_CHANGE, {}, true),
      e(EventType.OUT, { pitcherId: 'unknown-pitcher', batterId: 'b1', outType: 'groundout' }, false),
      // Back to top of 2nd — home defending; should still be 'relief', not 'home-p'
      e(EventType.INNING_CHANGE, {}, false),
      e(EventType.OUT, { pitcherId: 'unknown-pitcher', batterId: 'b1', outType: 'groundout' }, true),
    ];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stats = derivePitchingStats(events as any, players);
    expect(stats.get('home-p')!.inningsPitchedOuts).toBe(1); // just the first out
    expect(stats.get('relief')!.inningsPitchedOuts).toBe(3); // 2 in 1st + 1 in 2nd
    expect(stats.get('away-p')!.inningsPitchedOuts).toBe(1);
  });
});

describe('derivePitchingStats — currentPitcherId resistance to stub pollution', () => {
  beforeEach(resetSeq);

  it('stub pitcherId does not displace the active pitcher on the mound', () => {
    const events: Evt[] = [
      e(EventType.GAME_START, { homeLineupPitcherId: 'home-p', awayLineupPitcherId: 'away-p' }),
      // Real pitch establishes currentPitcherId = home-p
      e(EventType.PITCH_THROWN, { pitcherId: 'home-p', batterId: 'b1', outcome: PitchOutcome.IN_PLAY }),
      // Stub pitch must NOT overwrite
      e(EventType.PITCH_THROWN, { pitcherId: 'unknown-pitcher', batterId: 'b1', outcome: PitchOutcome.IN_PLAY }),
      // Out event with stub payload → should still attribute to home-p via currentPitcherId fallback
      e(EventType.OUT, { pitcherId: 'unknown-pitcher', batterId: 'b1', outType: 'groundout' }),
    ];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stats = derivePitchingStats(events as any, players);
    expect(stats.has('unknown-pitcher')).toBe(false);
    expect(stats.get('home-p')!.inningsPitchedOuts).toBe(1);
    expect(stats.get('home-p')!.totalPitches).toBe(2);
  });
});

describe('derivePitchingStats — earned vs unearned run attribution', () => {
  beforeEach(resetSeq);

  it('marks runs as unearned when the scoring runner reached on FIELD_ERROR', () => {
    const events: Evt[] = [
      e(EventType.GAME_START, { homeLineupPitcherId: 'home-p', awayLineupPitcherId: 'away-p' }),
      // b1 reaches on error
      e(EventType.PITCH_THROWN, { pitcherId: 'home-p', batterId: 'b1', outcome: PitchOutcome.IN_PLAY }),
      e(EventType.FIELD_ERROR, { pitcherId: 'home-p', batterId: 'b1', errorBy: 6 }),
      // b2 homers — runs b1 (unearned) + b2 (earned)
      e(EventType.PITCH_THROWN, { pitcherId: 'home-p', batterId: 'b2', outcome: PitchOutcome.IN_PLAY }),
      e(EventType.HIT, { pitcherId: 'home-p', batterId: 'b2', hitType: HitType.HOME_RUN, rbis: 2 }),
    ];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stats = derivePitchingStats(events as any, players);
    const s = stats.get('home-p')!;
    expect(s.runsAllowed).toBe(2);
    expect(s.earnedRunsAllowed).toBe(1); // only b2's run is earned
  });

  it('marks a CATCHER_INTERFERENCE runner as unearned', () => {
    const events: Evt[] = [
      e(EventType.GAME_START, { homeLineupPitcherId: 'home-p', awayLineupPitcherId: 'away-p' }),
      // b1 reaches on CI (no preceding PITCH for simplicity)
      e(EventType.CATCHER_INTERFERENCE, { batterId: 'b1', pitcherId: 'home-p' }),
      // b2 homers — b1 unearned, b2 earned
      e(EventType.PITCH_THROWN, { pitcherId: 'home-p', batterId: 'b2', outcome: PitchOutcome.IN_PLAY }),
      e(EventType.HIT, { pitcherId: 'home-p', batterId: 'b2', hitType: HitType.HOME_RUN, rbis: 2 }),
    ];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stats = derivePitchingStats(events as any, players);
    const s = stats.get('home-p')!;
    expect(s.runsAllowed).toBe(2);
    expect(s.earnedRunsAllowed).toBe(1);
  });

  it('still marks a CI runner unearned when the event is preceded by a real pitch', () => {
    // Mirrors production flow: scorer records a pitch, then catcher
    // interference is called on it. Attribution should still route the
    // eventual run from the CI runner as unearned.
    const events: Evt[] = [
      e(EventType.GAME_START, { homeLineupPitcherId: 'home-p', awayLineupPitcherId: 'away-p' }),
      e(EventType.PITCH_THROWN, { pitcherId: 'home-p', batterId: 'b1', outcome: PitchOutcome.IN_PLAY }),
      e(EventType.CATCHER_INTERFERENCE, { batterId: 'b1', pitcherId: 'home-p' }),
      e(EventType.PITCH_THROWN, { pitcherId: 'home-p', batterId: 'b2', outcome: PitchOutcome.IN_PLAY }),
      e(EventType.HIT, { pitcherId: 'home-p', batterId: 'b2', hitType: HitType.HOME_RUN, rbis: 2 }),
    ];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stats = derivePitchingStats(events as any, players);
    const s = stats.get('home-p')!;
    expect(s.runsAllowed).toBe(2);
    expect(s.earnedRunsAllowed).toBe(1);
  });
});

describe('derivePitchingStats — DROPPED_THIRD_STRIKE', () => {
  beforeEach(resetSeq);

  it('credits a K to the pitcher even when the batter reaches on a D3K error', () => {
    const events: Evt[] = [
      e(EventType.GAME_START, { homeLineupPitcherId: 'home-p', awayLineupPitcherId: 'away-p' }),
      e(EventType.DROPPED_THIRD_STRIKE, {
        pitcherId: 'home-p',
        batterId: 'b1',
        outcome: 'reached_on_error',
        errorBy: 2,
      }),
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stats = derivePitchingStats(events as any, players);
    const s = stats.get('home-p')!;
    expect(s.strikeouts).toBe(1);
    // Batter reached, so this isn't an out for IP purposes.
    expect(s.inningsPitchedOuts).toBe(0);
  });

  it('does not double-count K when pitch progression already credited the strikeout', () => {
    // Three strike pitches credit the K via pitch progression; the
    // DROPPED_THIRD_STRIKE event must not add another K on top.
    const events: Evt[] = [
      e(EventType.GAME_START, { homeLineupPitcherId: 'home-p', awayLineupPitcherId: 'away-p' }),
      e(EventType.PITCH_THROWN, { pitcherId: 'home-p', batterId: 'b1', outcome: PitchOutcome.SWINGING_STRIKE }),
      e(EventType.PITCH_THROWN, { pitcherId: 'home-p', batterId: 'b1', outcome: PitchOutcome.SWINGING_STRIKE }),
      e(EventType.PITCH_THROWN, { pitcherId: 'home-p', batterId: 'b1', outcome: PitchOutcome.SWINGING_STRIKE }),
      e(EventType.DROPPED_THIRD_STRIKE, {
        pitcherId: 'home-p',
        batterId: 'b1',
        outcome: 'thrown_out',
        fieldingSequence: [2, 3],
      }),
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stats = derivePitchingStats(events as any, players);
    const s = stats.get('home-p')!;
    expect(s.strikeouts).toBe(1);
    expect(s.inningsPitchedOuts).toBe(1);
  });

  it('counts a wild pitch when D3K outcome is reached_wild_pitch with isWildPitch=true', () => {
    const events: Evt[] = [
      e(EventType.GAME_START, { homeLineupPitcherId: 'home-p', awayLineupPitcherId: 'away-p' }),
      e(EventType.DROPPED_THIRD_STRIKE, {
        pitcherId: 'home-p',
        batterId: 'b1',
        outcome: 'reached_wild_pitch',
        isWildPitch: true,
      }),
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stats = derivePitchingStats(events as any, players);
    const s = stats.get('home-p')!;
    expect(s.strikeouts).toBe(1);
    expect(s.wildPitches).toBe(1);
  });

  it('does not count a wild pitch when isWildPitch is false (passed ball)', () => {
    const events: Evt[] = [
      e(EventType.GAME_START, { homeLineupPitcherId: 'home-p', awayLineupPitcherId: 'away-p' }),
      e(EventType.DROPPED_THIRD_STRIKE, {
        pitcherId: 'home-p',
        batterId: 'b1',
        outcome: 'reached_wild_pitch',
        isWildPitch: false,
      }),
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stats = derivePitchingStats(events as any, players);
    const s = stats.get('home-p')!;
    expect(s.strikeouts).toBe(1);
    expect(s.wildPitches).toBe(0);
  });

  it('marks a run scored by a D3K-error baserunner as unearned for the pitcher', () => {
    // b1 reaches on a D3K error charged to the catcher. b2 then homers.
    // Run by b1 is unearned (reached on error); run by b2 is earned.
    const events: Evt[] = [
      e(EventType.GAME_START, { homeLineupPitcherId: 'home-p', awayLineupPitcherId: 'away-p' }),
      e(EventType.DROPPED_THIRD_STRIKE, {
        pitcherId: 'home-p',
        batterId: 'b1',
        outcome: 'reached_on_error',
        errorBy: 2,
      }),
      e(EventType.PITCH_THROWN, { pitcherId: 'home-p', batterId: 'b2', outcome: PitchOutcome.IN_PLAY }),
      e(EventType.HIT, { pitcherId: 'home-p', batterId: 'b2', hitType: HitType.HOME_RUN, rbis: 2 }),
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stats = derivePitchingStats(events as any, players);
    const s = stats.get('home-p')!;
    expect(s.runsAllowed).toBe(2);
    expect(s.earnedRunsAllowed).toBe(1);
  });
});
