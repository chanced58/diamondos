import { emptyTournamentFormValues, lineupSummary, parseTournamentForm } from '../tournament-form-model';
import { gameWhen, statsCaption, statusLabel, tournamentDates } from '../tournament-format';

const REQUEST = '11111111-1111-4111-8111-111111111111';
const TEAM = '22222222-2222-4222-8222-222222222222';

describe('tournament form', () => {
  const base = { ...emptyTournamentFormValues('2026-10-30', TEAM), name: ' Fall Classic ', endDate: '2026-11-01' };

  it('should enter an existing team with the standard lineup', () => {
    expect(parseTournamentForm(base, REQUEST)).toEqual({
      ok: true,
      input: {
        name: 'Fall Classic',
        startDate: '2026-10-30',
        endDate: '2026-11-01',
        requestId: REQUEST,
        team: { type: 'existing', teamId: TEAM },
        lineup: { allowExpanded: false, maxBatters: undefined, allowMidGameChanges: false },
      },
    });
  });

  it('should create a new team with an expanded lineup', () => {
    const result = parseTournamentForm(
      { ...base, teamType: 'new', teamName: 'Idaho Natives', stateCode: 'id', allowExpanded: true, maxBatters: 15, allowMidGameChanges: true },
      REQUEST,
    );
    expect(result).toMatchObject({
      ok: true,
      input: { team: { type: 'new', name: 'Idaho Natives', stateCode: 'ID', organization: undefined }, lineup: { allowExpanded: true, maxBatters: 15 } },
    });
  });

  it('should explain what is missing or wrong', () => {
    expect(parseTournamentForm({ ...base, name: '' }, REQUEST)).toEqual({ ok: false, error: 'Tournament name is required' });
    expect(parseTournamentForm({ ...base, endDate: '2026-10-29' }, REQUEST)).toEqual({ ok: false, error: 'End date must be on or after the start date.' });
    expect(parseTournamentForm({ ...base, teamId: '' }, REQUEST)).toEqual({ ok: false, error: 'Pick a team.' });
    expect(parseTournamentForm({ ...base, teamType: 'new', teamName: 'X', stateCode: 'I' }, REQUEST)).toEqual({ ok: false, error: 'State must be a two-letter code.' });
  });

  it('should start on a new team for someone who heads none', () => {
    expect(emptyTournamentFormValues('2026-10-30', null)).toMatchObject({ teamType: 'new', teamId: '' });
    expect(lineupSummary({ allowExpanded: true, maxBatters: 12, allowMidGameChanges: true })).toBe('Up to 12 batters · expansion and contraction allowed');
    expect(lineupSummary({ allowExpanded: false, maxBatters: 12, allowMidGameChanges: false })).toBe('Up to 9 batters');
  });
});

describe('tournament format', () => {
  it('should word date ranges, statuses and captions', () => {
    expect(tournamentDates('2026-10-30', '2026-11-01')).toBe('Oct 30 – Nov 1, 2026');
    expect(tournamentDates('2026-12-30', '2027-01-02')).toBe('Dec 30, 2026 – Jan 2, 2027');
    expect(tournamentDates('2026-10-30', '2026-10-30')).toBe('Oct 30, 2026');
    expect(statusLabel('in_progress')).toBe('In progress');
    expect(statsCaption(0)).toBe('Stats appear here once a tournament game is scored.');
    expect(statsCaption(1)).toContain('From 1 scored game.');
    expect(gameWhen('2026-10-30T22:00:00Z', 'America/Boise')).toBe('Oct 30, 4:00 PM');
  });
});
