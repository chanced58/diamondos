import {
  createTournamentSchema,
  createTournamentScoringSettings,
} from '../tournament';
import { mergeWithDefaults } from '../league-scoring-settings';

const base = {
  name: 'Fall Classic',
  startDate: '2026-10-20',
  endDate: '2026-10-22',
  requestId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  team: { type: 'existing', teamId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' },
  lineup: { allowExpanded: false, allowMidGameChanges: false },
};

describe('createTournamentSchema', () => {
  it('accepts an administered-team selection with the standard lineup', () => {
    expect(createTournamentSchema.parse(base).team).toEqual(base.team);
  });

  it('accepts a tournament team selection with optional organization details', () => {
    const input = {
      ...base,
      team: { type: 'new', name: 'Tournament Team', organization: 'DiamondOS', stateCode: 'tx' },
    };
    expect(createTournamentSchema.parse(input).team).toEqual({
      type: 'new', name: 'Tournament Team', organization: 'DiamondOS', stateCode: 'TX',
    });
  });

  it('rejects missing names, invalid IDs, and reversed or impossible calendar dates', () => {
    expect(createTournamentSchema.safeParse({ ...base, name: ' ' }).success).toBe(false);
    expect(createTournamentSchema.safeParse({ ...base, requestId: 'bad-id' }).success).toBe(false);
    expect(createTournamentSchema.safeParse({ ...base, team: { type: 'existing', teamId: 'bad-id' } }).success).toBe(false);
    expect(createTournamentSchema.safeParse({ ...base, startDate: '2026-02-30' }).success).toBe(false);
    expect(createTournamentSchema.safeParse({ ...base, startDate: '2026-10-23' }).success).toBe(false);
  });

  it('requires a nonempty name for a newly created team', () => {
    expect(createTournamentSchema.safeParse({ ...base, team: { type: 'new', name: ' ' } }).success).toBe(false);
  });

  it('requires an explicit lineup cap between 10 and 30 for expanded orders', () => {
    for (const cap of [10, 30]) {
      expect(createTournamentSchema.safeParse({ ...base, lineup: { allowExpanded: true, maxBatters: cap, allowMidGameChanges: false } }).success).toBe(true);
    }
    for (const cap of [9, 31]) {
      expect(createTournamentSchema.safeParse({ ...base, lineup: { allowExpanded: true, maxBatters: cap, allowMidGameChanges: false } }).success).toBe(false);
    }
  });
});

describe('createTournamentScoringSettings', () => {
  it.each([
    [false, false, false, false],
    [false, true, true, true],
    [true, false, false, false],
    [true, true, true, true],
  ])('maps expanded=%s and mid-game=%s into the independent settings', (expanded, midGame, extension, contraction) => {
    const settings = createTournamentScoringSettings({
      allowExpanded: expanded,
      maxBatters: expanded ? 12 : undefined,
      allowMidGameChanges: midGame,
    });
    expect(settings.lineup).toMatchObject({
      allowExpanded: expanded,
      maxBatters: expanded ? 12 : 9,
      allowMidGameExtension: extension,
      allowMidGameContraction: contraction,
    });
  });

  it('keeps contraction disabled when reading legacy league settings', () => {
    expect(mergeWithDefaults({ lineup: { allowExpanded: true, maxBatters: 12, allowMidGameExtension: true } }).lineup.allowMidGameContraction).toBe(false);
  });
});
