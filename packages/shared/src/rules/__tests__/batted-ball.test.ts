import { EventType } from '../../types/game-event';
import {
  appendThrow,
  fieldPointFromSpray,
  nearestFielder,
  requiresThrowStep,
  sprayFromFieldPoint,
  undoThrow,
} from '../batted-ball';

describe('sprayFromFieldPoint', () => {
  it('should put home plate at the bottom centre of the spray space', () => {
    expect(sprayFromFieldPoint(120, 185)).toEqual({ sprayX: 0.5, sprayY: 0 });
  });

  it('should match web at the left foul pole, clamping x to the edge', () => {
    const { sprayX, sprayY } = sprayFromFieldPoint(14, 79);
    expect(sprayX).toBe(0);
    expect(sprayY).toBeCloseTo(0.7067, 4);
  });

  it('should match web at the right foul pole, clamping x to the edge', () => {
    const { sprayX, sprayY } = sprayFromFieldPoint(226, 79);
    expect(sprayX).toBe(1);
    expect(sprayY).toBeCloseTo(0.7067, 4);
  });

  it('should put the deep centre-field wall at sprayY 1', () => {
    expect(sprayFromFieldPoint(120, 35)).toEqual({ sprayX: 0.5, sprayY: 1 });
  });

  it('should clamp a tap beyond the wall to sprayY 1', () => {
    expect(sprayFromFieldPoint(120, 5).sprayY).toBe(1);
  });

  it('should place first base where web does', () => {
    const { sprayX, sprayY } = sprayFromFieldPoint(165, 140);
    expect(sprayX).toBeCloseTo(0.8, 10);
    expect(sprayY).toBeCloseTo(0.3, 10);
  });
});

describe('fieldPointFromSpray', () => {
  it('should round-trip a point inside the field', () => {
    const { sprayX, sprayY } = sprayFromFieldPoint(165, 140);
    const { x, y } = fieldPointFromSpray(sprayX, sprayY);
    expect(x).toBeCloseTo(165, 10);
    expect(y).toBeCloseTo(140, 10);
  });
});

describe('nearestFielder', () => {
  it('should give a deep fly to centre to the centre fielder', () => {
    expect(nearestFielder(0.5, 0.97)).toBe(8);
  });

  it('should give a ball up the third-base line to the third baseman', () => {
    expect(nearestFielder(0.25, 0.33)).toBe(5);
  });

  it('should give a grounder nudged toward second but nearer short to the shortstop', () => {
    expect(nearestFielder(0.42, 0.58)).toBe(6);
  });

  it('should give a bunt near the plate to the catcher', () => {
    expect(nearestFielder(0.5, 0.06)).toBe(2);
  });
});

describe('appendThrow', () => {
  it('should add the next fielder to the sequence', () => {
    expect(appendThrow([6], 3)).toEqual([6, 3]);
  });

  it('should not grow past five positions', () => {
    expect(appendThrow([6, 4, 3, 4, 3], 1)).toEqual([6, 4, 3, 4, 3]);
  });

  it('should ignore a fielder throwing to himself', () => {
    expect(appendThrow([6], 6)).toEqual([6]);
  });

  it('should not mutate the sequence it was given', () => {
    const sequence = [6];
    appendThrow(sequence, 3);
    expect(sequence).toEqual([6]);
  });
});

describe('undoThrow', () => {
  it('should remove the last throw', () => {
    expect(undoThrow([6, 4, 3])).toEqual([6, 4]);
  });

  it('should never remove the first fielder', () => {
    expect(undoThrow([6])).toEqual([6]);
  });

  it('should leave an empty sequence empty', () => {
    expect(undoThrow([])).toEqual([]);
  });
});

describe('requiresThrowStep', () => {
  it.each([
    EventType.OUT,
    EventType.SACRIFICE_FLY,
    EventType.SACRIFICE_BUNT,
    EventType.DOUBLE_PLAY,
    EventType.TRIPLE_PLAY,
  ])('should ask for throws on %s', (eventType) => {
    expect(requiresThrowStep(eventType)).toBe(true);
  });

  it.each([EventType.HIT, EventType.FIELD_ERROR])('should not ask for throws on %s', (eventType) => {
    expect(requiresThrowStep(eventType)).toBe(false);
  });
});
