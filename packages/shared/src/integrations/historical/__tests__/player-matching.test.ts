import {
  normalizePersonName,
  parseName,
  scoreMatch,
  classifyMatch,
  bestMatch,
} from '../player-matching';

describe('normalizePersonName', () => {
  it('lowercases, strips accents, punctuation and suffixes', () => {
    expect(normalizePersonName('José')).toBe('jose');
    expect(normalizePersonName("O'Brien")).toBe('obrien');
    expect(normalizePersonName('Smith Jr.')).toBe('smith');
    expect(normalizePersonName('  Doe  III ')).toBe('doe');
  });
});

describe('parseName', () => {
  it('parses "Last, First" form', () => {
    expect(parseName('Lovelace, Ada')).toEqual({ first: 'Ada', last: 'Lovelace' });
  });
  it('parses "First Last" form', () => {
    expect(parseName('Ada Lovelace')).toEqual({ first: 'Ada', last: 'Lovelace' });
  });
  it('handles a single token as last name', () => {
    expect(parseName('Cher')).toEqual({ first: '', last: 'Cher' });
  });
});

describe('scoreMatch', () => {
  const candidate = {
    playerId: 'p1',
    firstName: 'Ada',
    lastName: 'Lovelace',
    jerseyNumber: 7,
    dateOfBirth: '2008-12-10',
  };

  it('scores a full exact match at 1.0', () => {
    const { score } = scoreMatch(
      { firstName: 'Ada', lastName: 'Lovelace', jerseyNumber: 7, dateOfBirth: '2008-12-10' },
      candidate,
    );
    expect(score).toBeCloseTo(1.0);
  });

  it('scores last-name-only lower than last+first', () => {
    const lastOnly = scoreMatch({ lastName: 'Lovelace' }, candidate).score;
    const lastFirst = scoreMatch({ firstName: 'Ada', lastName: 'Lovelace' }, candidate).score;
    expect(lastFirst).toBeGreaterThan(lastOnly);
  });

  it('rewards a jersey match', () => {
    const withJersey = scoreMatch({ lastName: 'Lovelace', jerseyNumber: 7 }, candidate).score;
    const noJersey = scoreMatch({ lastName: 'Lovelace' }, candidate).score;
    expect(withJersey).toBeGreaterThan(noJersey);
  });

  it('gives partial credit for a first-initial match', () => {
    const initial = scoreMatch({ firstName: 'A', lastName: 'Lovelace' }, candidate);
    const full = scoreMatch({ firstName: 'Ada', lastName: 'Lovelace' }, candidate);
    expect(initial.score).toBeGreaterThan(0);
    expect(initial.score).toBeLessThan(full.score);
  });

  it('scores a different person near zero', () => {
    const { score } = scoreMatch({ firstName: 'Grace', lastName: 'Hopper' }, candidate);
    expect(score).toBe(0);
  });
});

describe('classifyMatch', () => {
  it('classifies by threshold', () => {
    expect(classifyMatch(0.95)).toBe('auto');
    expect(classifyMatch(0.7)).toBe('suggest');
    expect(classifyMatch(0.3)).toBe('none');
  });
});

describe('bestMatch', () => {
  const candidates = [
    { playerId: 'a', firstName: 'Ada', lastName: 'Lovelace', jerseyNumber: 7, dateOfBirth: null },
    { playerId: 'b', firstName: 'Alan', lastName: 'Turing', jerseyNumber: 1, dateOfBirth: null },
  ];

  it('returns the highest-scoring candidate', () => {
    const result = bestMatch({ firstName: 'Ada', lastName: 'Lovelace' }, candidates);
    expect(result?.candidate.playerId).toBe('a');
    // Name-only (no jersey/DOB) is a suggestion, not an auto-confirm.
    expect(result?.classification).toBe('suggest');
  });

  it('auto-confirms when jersey corroborates the name', () => {
    const result = bestMatch(
      { firstName: 'Ada', lastName: 'Lovelace', jerseyNumber: 7 },
      candidates,
    );
    expect(result?.candidate.playerId).toBe('a');
    expect(result?.classification).toBe('auto');
  });

  it('returns null when no candidate clears the suggest threshold', () => {
    const result = bestMatch({ firstName: 'Margaret', lastName: 'Hamilton' }, candidates);
    expect(result).toBeNull();
  });
});
