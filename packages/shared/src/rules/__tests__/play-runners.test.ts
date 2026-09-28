import {
  applyLinkedAdvance,
  applyPlayToRunners,
  applyRunnerOut,
  collectLinkedRunnerOutcomes,
  type Bases,
} from '../play-runners';

const id = (r: string) => r;
const bases = (first: string | null, second: string | null, third: string | null): Bases<string> => ({
  first,
  second,
  third,
});

function linked(type: 'baserunner_out' | 'baserunner_advance', payload: Record<string, unknown>) {
  return { eventType: type, payload: { relatedEventId: 'hit', ...payload } };
}

describe('collectLinkedRunnerOutcomes', () => {
  it('should group linked outcomes by parent play, by starting base when recorded', () => {
    const map = collectLinkedRunnerOutcomes([
      linked('baserunner_out', { runnerId: 'a', fromBase: 1 }),
      linked('baserunner_advance', { runnerId: 'b', fromBase: 2, toBase: 3 }),
      { eventType: 'baserunner_advance', payload: { runnerId: 'c', fromBase: 3, toBase: 4 } }, // not linked
    ]);
    expect([...map.keys()]).toEqual(['hit']);
    expect(map.get('hit')?.overriddenBases).toEqual(new Set([1, 2]));
  });

  it('should fall back to runner id for older linked events without fromBase', () => {
    const map = collectLinkedRunnerOutcomes([linked('baserunner_out', { runnerId: 'a' })]);
    expect(map.get('hit')?.outRunnerIds).toEqual(new Set(['a']));
    expect(map.get('hit')?.overriddenBases.size).toBe(0);
  });

  it('should read snake_case rows too', () => {
    const map = collectLinkedRunnerOutcomes([
      { event_type: 'baserunner_out', payload: { relatedEventId: 'hit', runnerId: 'a', fromBase: 2 } },
    ]);
    expect(map.get('hit')?.overriddenBases).toEqual(new Set([2]));
  });
});

describe('applyPlayToRunners — hits with no linked outcomes', () => {
  it('should move runners up by the bases the batter took and put the batter on', () => {
    expect(applyPlayToRunners(bases('r1', 'r2', null), { kind: 'hit', bases: 1 }, 'b', undefined, id)).toEqual({
      runners: bases('b', 'r1', 'r2'),
      scoring: [],
      runs: 0,
    });
  });

  it('should score runners who reach home, lead runner first', () => {
    expect(applyPlayToRunners(bases('r1', 'r2', 'r3'), { kind: 'hit', bases: 2 }, 'b', undefined, id)).toEqual({
      runners: bases(null, 'b', 'r1'),
      scoring: ['r3', 'r2'],
      runs: 2,
    });
  });

  it('should clear the bases and score everyone, batter last, on a home run', () => {
    expect(applyPlayToRunners(bases('r1', null, 'r3'), { kind: 'hit', bases: 4 }, 'b', undefined, id)).toEqual({
      runners: bases(null, null, null),
      scoring: ['r3', 'r1', 'b'],
      runs: 3,
    });
  });
});

describe('applyPlayToRunners — runners with a linked outcome are left off', () => {
  it('should neither place nor score a runner overridden by base', () => {
    const overrides = collectLinkedRunnerOutcomes([linked('baserunner_advance', { runnerId: 'r2', fromBase: 2, toBase: 3 })]);
    // Double: r2 would score by default — held instead, so not scored or placed.
    expect(applyPlayToRunners(bases(null, 'r2', null), { kind: 'hit', bases: 2 }, 'b', overrides.get('hit'), id)).toEqual({
      runners: bases(null, 'b', null),
      scoring: [],
      runs: 0,
    });
  });

  it('should tell two runners sharing an id apart by base', () => {
    const overrides = collectLinkedRunnerOutcomes([linked('baserunner_out', { runnerId: 'dup', fromBase: 1 })]);
    expect(applyPlayToRunners(bases('dup', 'dup', null), { kind: 'hit', bases: 1 }, 'b', overrides.get('hit'), id)).toEqual({
      runners: bases('b', null, 'dup'),
      scoring: [],
      runs: 0,
    });
  });

  it('should match an older linked event by runner id', () => {
    const overrides = collectLinkedRunnerOutcomes([linked('baserunner_out', { runnerId: 'r3' })]);
    expect(applyPlayToRunners(bases(null, null, 'r3'), { kind: 'hit', bases: 1 }, 'b', overrides.get('hit'), id).scoring).toEqual([]);
  });
});

describe('applyPlayToRunners — batter with no id', () => {
  it('should still count the batter\'s run on a home run', () => {
    expect(applyPlayToRunners(bases(null, null, null), { kind: 'hit', bases: 4 }, null, undefined, id)).toEqual({
      runners: bases(null, null, null),
      scoring: [],
      runs: 1,
    });
  });
});

describe('applyLinkedAdvance', () => {
  it('should put a held runner on his base without disturbing the batter (runner from 2nd held at 3rd on a double)', () => {
    const afterHit = bases(null, 'b', null); // the double already dropped r2
    expect(applyLinkedAdvance(afterHit, { runnerId: 'r2', fromBase: 2, toBase: 3, relatedEventId: 'hit' }, 'r2', id)).toEqual(
      bases(null, 'b', 'r2'),
    );
  });

  it('should place nothing for an advance home — the SCORE event carries the run', () => {
    const afterHit = bases('b', null, null);
    expect(applyLinkedAdvance(afterHit, { runnerId: 'r2', fromBase: 2, toBase: 4, relatedEventId: 'hit' }, 'r2', id)).toEqual(
      bases('b', null, null),
    );
  });

  it('should move a standalone advance off its starting base', () => {
    expect(applyLinkedAdvance(bases('r1', null, null), { runnerId: 'r1', fromBase: 1, toBase: 2 }, 'r1', id)).toEqual(
      bases(null, 'r1', null),
    );
  });

  it('should fall back to the runner id when an unlinked advance names the wrong base', () => {
    expect(applyLinkedAdvance(bases('r1', null, null), { runnerId: 'r1', fromBase: 2, toBase: 3 }, 'r1', id)).toEqual(
      bases(null, null, 'r1'),
    );
  });
});

describe('applyRunnerOut', () => {
  it('should clear the named base', () => {
    expect(applyRunnerOut(bases('dup', 'dup', null), { runnerId: 'dup', fromBase: 2 }, id)).toEqual(bases('dup', null, null));
  });

  it('should clear nothing for a linked out whose runner the play already dropped', () => {
    expect(applyRunnerOut(bases('b', null, 'dup'), { runnerId: 'dup', fromBase: 1, relatedEventId: 'hit' }, id)).toEqual(
      bases('b', null, 'dup'),
    );
  });

  it('should fall back to the first base holding the id (older events, web "Out at")', () => {
    expect(applyRunnerOut(bases('r1', null, null), { runnerId: 'r1', fromBase: 2 }, id)).toEqual(bases(null, null, null));
    expect(applyRunnerOut(bases(null, 'r2', null), { runnerId: 'r2' }, id)).toEqual(bases(null, null, null));
  });
});

describe('older runner moves with no runner id', () => {
  it('should clear the named base on a standalone advance and place the stand-in given', () => {
    expect(applyLinkedAdvance(bases('x', null, null), { fromBase: 1, toBase: 2 }, 'stand-in', id)).toEqual(
      bases(null, 'stand-in', null),
    );
  });

  it('should clear the named base on a standalone out', () => {
    expect(applyRunnerOut(bases(null, 'x', null), { fromBase: 2 }, id)).toEqual(bases(null, null, null));
  });

  it('should leave the bases alone for a linked move with no runner id', () => {
    expect(applyRunnerOut(bases('b', null, null), { fromBase: 1, relatedEventId: 'hit' }, id)).toEqual(
      bases('b', null, null),
    );
  });
});
