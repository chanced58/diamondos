import { activateSeason, createSeason, deactivateSeason, fetchTeamSeasons, seasonDates, seasonYears } from '../seasons-api';
import type { ApiClient } from '../../../lib/api-client';

const client = { get: jest.fn(), post: jest.fn() } as unknown as ApiClient & { get: jest.Mock; post: jest.Mock };

describe('seasons api', () => {
  it('should call the team’s season routes', async () => {
    await fetchTeamSeasons('t 1', client);
    expect(client.get).toHaveBeenCalledWith('/teams/t%201/seasons', expect.anything());
    await createSeason('t1', 'Fall', 2027, client);
    expect(client.post).toHaveBeenCalledWith('/teams/t1/seasons', { term: 'Fall', year: 2027 }, expect.anything());
    await activateSeason('t1', 's1', client);
    expect(client.post).toHaveBeenCalledWith('/teams/t1/seasons/s1/activate', {}, expect.anything());
    await deactivateSeason('t1', 's1', client);
    expect(client.post).toHaveBeenCalledWith('/teams/t1/seasons/s1/deactivate', {}, expect.anything());
  });
});

describe('seasonYears', () => {
  it('should offer last year, this year and next', () => {
    expect(seasonYears(new Date(2026, 9, 26))).toEqual([2025, 2026, 2027]);
  });
});

describe('seasonDates', () => {
  it('should show a season’s days, or its start when it has no end', () => {
    expect(seasonDates('2027-03-01', '2027-05-31')).toBe('Mar 1, 2027 – May 31, 2027');
    expect(seasonDates('2027-03-01', null)).toBe('From Mar 1, 2027');
  });
});
