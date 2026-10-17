import { buildGameCalendarEntries, type ScheduleGame } from '../schedule-calendar';

function game(overrides: Partial<ScheduleGame> = {}): ScheduleGame {
  return {
    id: 'g1',
    team_id: 'natives',
    opponent_name: 'Wildcats',
    scheduled_at: '2026-10-20T18:00:00.000Z',
    location_type: 'home',
    neutral_home_team: null,
    status: 'scheduled',
    tournament_id: null,
    ...overrides,
  };
}

describe('buildGameCalendarEntries', () => {
  it('shows a tournament game on the team calendar like any other game, labeled Tournament', () => {
    const [entry] = buildGameCalendarEntries([game({ tournament_id: 'cup' })], {
      activeTeamId: 'natives', isLeagueView: false, teamNameMap: {},
    });
    expect(entry).toMatchObject({ id: 'g1', type: 'game', title: 'vs Wildcats', url: '/games/g1', detail: 'Tournament' });
  });

  it('keeps the status beside the Tournament label once play starts', () => {
    const [entry] = buildGameCalendarEntries([game({ tournament_id: 'cup', status: 'in_progress' })], {
      activeTeamId: 'natives', isLeagueView: false, teamNameMap: {},
    });
    expect(entry.detail).toBe('Tournament · in progress');
  });

  it('leaves regular games unchanged', () => {
    const entries = buildGameCalendarEntries(
      [game(), game({ id: 'g2', location_type: 'away', status: 'completed', opponent_name: null })],
      { activeTeamId: 'natives', isLeagueView: false, teamNameMap: {} },
    );
    expect(entries.map((e) => [e.title, e.detail])).toEqual([['vs Wildcats', undefined], ['@ TBD', 'completed']]);
  });

  it('in league view, shows our tournament games but not other teams’ tournament games', () => {
    const entries = buildGameCalendarEntries(
      [
        game({ id: 'ours', tournament_id: 'cup' }),
        game({ id: 'theirs-cup', team_id: 'huskies', tournament_id: 'other-cup' }),
        game({ id: 'theirs-league', team_id: 'huskies' }),
      ],
      { activeTeamId: 'natives', isLeagueView: true, teamNameMap: { huskies: 'Huskies' } },
    );
    expect(entries.map((e) => [e.id, e.title])).toEqual([
      ['ours', 'vs Wildcats'],
      ['theirs-league', 'Huskies: vs Wildcats'],
    ]);
  });
});
