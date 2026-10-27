import { createSeasonInputSchema, seasonFor, teamSeasonsResponseSchema } from '../team-seasons';

const TEAM = '11111111-1111-4111-8111-111111111111';

describe('seasonFor', () => {
  it('should name each term with its year and give its fixed dates', () => {
    expect(seasonFor('Spring', 2027)).toEqual({ name: 'Spring 2027', startDate: '2027-03-01', endDate: '2027-05-31' });
    expect(seasonFor('Summer', 2027)).toEqual({ name: 'Summer 2027', startDate: '2027-06-01', endDate: '2027-08-31' });
    expect(seasonFor('Fall', 2026)).toEqual({ name: 'Fall 2026', startDate: '2026-09-01', endDate: '2026-11-30' });
  });
});

describe('createSeasonInputSchema', () => {
  it('should accept a term and a year from 2000 to 2100', () => {
    expect(createSeasonInputSchema.safeParse({ teamId: TEAM, term: 'Fall', year: 2026 }).success).toBe(true);
  });

  it('should refuse another term, a fractional or far-off year', () => {
    const issue = (input: object) => {
      const result = createSeasonInputSchema.safeParse({ teamId: TEAM, ...input });
      return result.success ? null : result.error.issues[0].message;
    };
    expect(issue({ term: 'Winter', year: 2026 })).toBe('Pick Spring, Summer or Fall.');
    expect(issue({ term: 'Fall', year: 1999 })).toBe('Pick a year from 2000 to 2100.');
    expect(issue({ term: 'Fall', year: 2026.5 })).not.toBeNull();
  });
});

describe('teamSeasonsResponseSchema', () => {
  it('should accept a season without an end date', () => {
    const seasons = [{ seasonId: 's1', name: 'Fall 2026', startDate: '2026-09-01', endDate: null, isActive: false }];
    expect(teamSeasonsResponseSchema.parse({ seasons })).toEqual({ seasons });
  });
});
