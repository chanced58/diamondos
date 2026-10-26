import { addInjuryFlagInputSchema, partitionInjuryFlags, rosterPlayerFieldsSchema } from '../roster-admin';

const TEAM = '11111111-1111-4111-8111-111111111111';
const PLAYER = '22222222-2222-4222-8222-222222222222';

describe('rosterPlayerFieldsSchema', () => {
  it('should read blank optional fields as null and tidy email and phone', () => {
    const parsed = rosterPlayerFieldsSchema.parse({
      firstName: ' Sam ',
      lastName: 'Lee',
      jerseyNumber: '',
      primaryPosition: '',
      bats: undefined,
      throws: '',
      graduationYear: null,
      email: ' Sam@Example.COM ',
      phone: '  ',
    });
    expect(parsed).toEqual({
      firstName: 'Sam',
      lastName: 'Lee',
      jerseyNumber: null,
      primaryPosition: null,
      secondaryPositions: [],
      bats: null,
      throws: null,
      graduationYear: null,
      email: 'sam@example.com',
      phone: null,
    });
  });

  it('should reject out-of-range numbers, unknown positions and bad emails', () => {
    const base = { firstName: 'Sam', lastName: 'Lee' };
    expect(rosterPlayerFieldsSchema.safeParse({ ...base, jerseyNumber: 100 }).success).toBe(false);
    expect(rosterPlayerFieldsSchema.safeParse({ ...base, jerseyNumber: 4.5 }).success).toBe(false);
    expect(rosterPlayerFieldsSchema.safeParse({ ...base, graduationYear: 1999 }).success).toBe(false);
    expect(rosterPlayerFieldsSchema.safeParse({ ...base, secondaryPositions: ['goalie'] }).success).toBe(false);
    expect(rosterPlayerFieldsSchema.safeParse({ ...base, email: 'not-an-email' }).success).toBe(false);
    expect(rosterPlayerFieldsSchema.safeParse({ ...base, firstName: '   ' }).success).toBe(false);
  });
});

describe('addInjuryFlagInputSchema', () => {
  const flag = { teamId: TEAM, playerId: PLAYER, injurySlug: 'shoulder', effectiveFrom: '2026-10-01' };

  it('should accept an open-ended flag and trim notes to null', () => {
    expect(addInjuryFlagInputSchema.parse({ ...flag, effectiveTo: '', notes: '   ' })).toMatchObject({ effectiveTo: null, notes: null });
  });

  it('should refuse an end before the start and malformed dates', () => {
    expect(addInjuryFlagInputSchema.safeParse({ ...flag, effectiveTo: '2026-09-30' }).success).toBe(false);
    expect(addInjuryFlagInputSchema.safeParse({ ...flag, effectiveFrom: '10/01/2026' }).success).toBe(false);
  });
});

describe('partitionInjuryFlags', () => {
  it('should sort flags into active, upcoming and past as of a day', () => {
    const open = { id: 'open', effectiveFrom: '2026-10-01', effectiveTo: null };
    const endsToday = { id: 'ends-today', effectiveFrom: '2026-10-01', effectiveTo: '2026-10-25' };
    const later = { id: 'later', effectiveFrom: '2026-11-01', effectiveTo: null };
    const done = { id: 'done', effectiveFrom: '2026-09-01', effectiveTo: '2026-10-24' };
    const { active, upcoming, past } = partitionInjuryFlags([open, endsToday, later, done], '2026-10-25');
    expect(active.map((f) => f.id)).toEqual(['open', 'ends-today']);
    expect(upcoming.map((f) => f.id)).toEqual(['later']);
    expect(past.map((f) => f.id)).toEqual(['done']);
  });
});
