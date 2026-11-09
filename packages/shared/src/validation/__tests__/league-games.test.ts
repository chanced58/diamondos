import {
  createLeagueGameInputSchema,
  listPlaceholdersInputSchema,
  manualResultInputSchema,
  resolvePlaceholderInputSchema,
  updateLeagueGameInputSchema,
} from '../league-games';

const id = (n: number) => `${String(n).repeat(8)}-1111-4111-8111-111111111111`;
const [LEAGUE, HOME, AWAY, GAME, PLAYER] = [id(1), id(2), id(3), id(4), id(5)];

const validGame = {
  leagueId: LEAGUE,
  homeTeamId: HOME,
  awayTeamId: AWAY,
  date: '2026-05-02',
  time: '18:30',
  timeZone: 'America/Chicago',
};

const box = {
  kind: 'box' as const,
  leagueGameId: GAME,
  homeInningRuns: [0, 2, 1],
  awayInningRuns: [1, 0, 0],
  homeHits: 5,
  awayHits: 3,
  homeErrors: 1,
  awayErrors: 0,
};

const line = { teamId: HOME, playerId: PLAYER, ab: 4, r: 1, h: 2, doubles: 1, triples: 0, hr: 0, rbi: 1, bb: 0, so: 1, hbp: 0, sf: 0, sb: 0 };

describe('createLeagueGameInputSchema', () => {
  it('should accept a valid game', () => {
    expect(createLeagueGameInputSchema.safeParse(validGame).success).toBe(true);
  });

  it('should reject a game where a team plays itself', () => {
    expect(createLeagueGameInputSchema.safeParse({ ...validGame, awayTeamId: HOME }).success).toBe(false);
  });

  it('should reject a malformed date, time or time zone', () => {
    expect(createLeagueGameInputSchema.safeParse({ ...validGame, date: '5/2/2026' }).success).toBe(false);
    expect(createLeagueGameInputSchema.safeParse({ ...validGame, time: '6:30pm' }).success).toBe(false);
    expect(createLeagueGameInputSchema.safeParse({ ...validGame, timeZone: 'Mars/Base' }).success).toBe(false);
  });
});

describe('updateLeagueGameInputSchema', () => {
  it('should accept a partial edit and reject unknown keys', () => {
    expect(updateLeagueGameInputSchema.safeParse({ leagueGameId: GAME, time: '19:00' }).success).toBe(true);
    expect(updateLeagueGameInputSchema.safeParse({ leagueGameId: GAME, homeTeamId: HOME }).success).toBe(false);
  });
});

describe('manualResultInputSchema', () => {
  it('should accept a final score', () => {
    expect(manualResultInputSchema.safeParse({ kind: 'final', leagueGameId: GAME, homeRuns: 4, awayRuns: 1 }).success).toBe(true);
  });

  it('should derive no runs field for box results (sums are computed by the service)', () => {
    const parsed = manualResultInputSchema.safeParse(box);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data).not.toHaveProperty('homeRuns');
    expect(parsed.data).not.toHaveProperty('awayRuns');
    expect(manualResultInputSchema.safeParse({ ...box, homeRuns: 3 }).success).toBe(false);
  });

  it('should accept a forfeit with only a winner', () => {
    expect(manualResultInputSchema.safeParse({ kind: 'forfeit', leagueGameId: GAME, winnerTeamId: HOME }).success).toBe(true);
  });

  it('should reject negative or fractional counts', () => {
    expect(manualResultInputSchema.safeParse({ kind: 'final', leagueGameId: GAME, homeRuns: -1, awayRuns: 0 }).success).toBe(false);
    expect(manualResultInputSchema.safeParse({ ...box, homeHits: 1.5 }).success).toBe(false);
  });

  it('should accept a batting result with valid lines', () => {
    expect(manualResultInputSchema.safeParse({ ...box, kind: 'batting', lines: [line] }).success).toBe(true);
  });

  it('should reject a batting line with more hits than at-bats', () => {
    const bad = { ...line, ab: 2, h: 3 };
    expect(manualResultInputSchema.safeParse({ ...box, kind: 'batting', lines: [bad] }).success).toBe(false);
  });

  it('should reject a batting line whose extra-base hits exceed its hits', () => {
    const bad = { ...line, h: 2, doubles: 1, triples: 1, hr: 1 };
    expect(manualResultInputSchema.safeParse({ ...box, kind: 'batting', lines: [bad] }).success).toBe(false);
  });

  it('should reject two batting lines for the same player', () => {
    expect(manualResultInputSchema.safeParse({ ...box, kind: 'batting', lines: [line, line] }).success).toBe(false);
  });
});

describe('resolvePlaceholderInputSchema', () => {
  const placeholderId = id(6);

  it('should accept link, create and fill_in actions', () => {
    expect(resolvePlaceholderInputSchema.safeParse({ action: 'link', placeholderId, playerId: PLAYER }).success).toBe(true);
    expect(
      resolvePlaceholderInputSchema.safeParse({ action: 'create', placeholderId, firstName: 'Sam', lastName: 'Lee', jerseyNumber: 7 }).success,
    ).toBe(true);
    expect(resolvePlaceholderInputSchema.safeParse({ action: 'fill_in', placeholderId }).success).toBe(true);
  });

  it('should reject a create without a name or with an out-of-range jersey', () => {
    expect(resolvePlaceholderInputSchema.safeParse({ action: 'create', placeholderId, firstName: ' ', lastName: 'Lee' }).success).toBe(false);
    expect(
      resolvePlaceholderInputSchema.safeParse({ action: 'create', placeholderId, firstName: 'Sam', lastName: 'Lee', jerseyNumber: 100 }).success,
    ).toBe(false);
  });
});

describe('listPlaceholdersInputSchema', () => {
  it('should accept a league or a league game but not neither', () => {
    expect(listPlaceholdersInputSchema.safeParse({ leagueId: LEAGUE }).success).toBe(true);
    expect(listPlaceholdersInputSchema.safeParse({ leagueGameId: GAME }).success).toBe(true);
    expect(listPlaceholdersInputSchema.safeParse({}).success).toBe(false);
  });
});
