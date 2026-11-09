import {
  assembleLeagueStats,
  resolveMyPlayerIds,
  type PlayerSnapshotRow,
  type TeamSnapshotRow,
} from '../load';
import type { StandingRow } from '../../league-home/load';

function player(over: Partial<PlayerSnapshotRow> & { player_id: string }): PlayerSnapshotRow {
  return {
    first_name: 'Alex',
    last_name: 'Ramirez',
    public_opt_out: false,
    team_id: 'reds',
    team_name: 'Reds',
    stats: { avg: 0.3 },
    plate_appearances: 30,
    innings_pitched_outs: 0,
    ...over,
  } as PlayerSnapshotRow;
}

function standing(team_id: string, team_name: string, win_pct: number): StandingRow {
  return {
    team_id, opponent_team_id: null, division_id: null, team_name,
    wins: 5, losses: 5, ties: 0, win_pct, runs_for: 0, runs_against: 0,
  };
}

function teamSnap(team_id: string, team_name: string, stats: unknown): TeamSnapshotRow {
  return { team_id, team_name, stats } as unknown as TeamSnapshotRow;
}

const SECTIONS = ['standings', 'leaders'];
function themeWith(disabled: string[]) {
  return { sections: SECTIONS.map((id) => ({ id, enabled: !disabled.includes(id) })) };
}

function base(over: Record<string, unknown> = {}) {
  return {
    slug: 'lg',
    league: { id: 'L1', name: 'League', level: null, home_theme: {}, leader_config: {} },
    season: '2026',
    seasons: ['2026'],
    isAuthed: false,
    standings: [standing('reds', 'Reds', 0.6), standing('jays', 'Jays', 0.4)],
    playerSnap: [] as PlayerSnapshotRow[],
    teamSnap: [] as TeamSnapshotRow[],
    myPlayerIds: new Set<string>(),
    activeTeam: null,
    ...over,
  } as Parameters<typeof assembleLeagueStats>[0];
}

describe('assembleLeagueStats', () => {
  it('public viewers never receive opted-out players or counts influenced by them', () => {
    const playerSnap = [
      player({ player_id: 'p1', first_name: 'Alex', last_name: 'Ramirez' }),
      player({ player_id: 'p2', first_name: 'Sam', last_name: 'Zzyzxlee', public_opt_out: true, stats: { avg: 0.9 }, plate_appearances: 99 }),
      player({ player_id: 'p3', first_name: 'Pat', last_name: 'Kim', stats: { avg: 0.2 } }),
    ];
    const result = assembleLeagueStats(base({ playerSnap }));
    const json = JSON.stringify(result);
    expect(json).not.toContain('p2');
    expect(json).not.toContain('Zzyzxlee');
    expect(json).not.toContain('Sam');
    expect(result.players.map((p) => p.playerId).sort()).toEqual(['p1', 'p3']);
    expect(result.ranks).not.toBeNull();
    for (const group of [result.ranks!.batting, result.ranks!.pitching]) {
      for (const cells of Object.values(group)) {
        expect(Object.keys(cells)).not.toContain('p2');
      }
    }
    for (const cells of Object.values(result.ranks!.batting)) {
      for (const cell of Object.values(cells)) expect(cell.leagueOf).toBe(2);
    }
  });

  it('members see opted-out players', () => {
    const playerSnap = [player({ player_id: 'p2', last_name: 'Lee', public_opt_out: true })];
    const result = assembleLeagueStats(base({ playerSnap, isAuthed: true }));
    expect(result.players).toHaveLength(1);
  });

  it('public names are masked, members see full names', () => {
    const playerSnap = [player({ player_id: 'p1', first_name: 'Alex', last_name: 'Ramirez' })];
    expect(assembleLeagueStats(base({ playerSnap })).players[0].name).toBe('Alex R.');
    expect(assembleLeagueStats(base({ playerSnap, isAuthed: true })).players[0].name).toBe('Alex Ramirez');
  });

  it('ranks is null when the leaders section is disabled', () => {
    const playerSnap = [player({ player_id: 'p1' })];
    const result = assembleLeagueStats(base({
      playerSnap,
      league: { id: 'L1', name: 'League', level: null, home_theme: themeWith(['leaders']), leader_config: {} },
    }));
    expect(result.rankingEnabled).toBe(false);
    expect(result.ranks).toBeNull();
    expect(result.players).toHaveLength(1);
  });

  it('team rank is null when standings is disabled, otherwise by win pct', () => {
    const ts = [teamSnap('jays', 'Jays', { avg: 1 }), teamSnap('reds', 'Reds', { avg: 2 })];
    const off = assembleLeagueStats(base({
      teamSnap: ts,
      league: { id: 'L1', name: 'League', level: null, home_theme: themeWith(['standings']), leader_config: {} },
    }));
    expect(off.standingsRankEnabled).toBe(false);
    expect(off.teams.every((t) => t.rank === null)).toBe(true);

    const on = assembleLeagueStats(base({ teamSnap: ts }));
    expect(on.teams.map((t) => [t.teamId, t.rank])).toEqual([['reds', 1], ['jays', 2]]);
    expect(on.teams[0].stats).toEqual({ avg: 2 });
  });

  it('teams exclude opponent rows and default stats to {}', () => {
    const standings = [standing('reds', 'Reds', 0.6), { ...standing('x', 'Opp', 0.9), team_id: null }];
    const result = assembleLeagueStats(base({ standings }));
    expect(result.teams).toHaveLength(1);
    expect(result.teams[0].stats).toEqual({});
  });

  it('unknown season yields empty players/teams without throwing', () => {
    const result = assembleLeagueStats(base({ season: '1999', standings: [] }));
    expect(result.players).toEqual([]);
    expect(result.teams).toEqual([]);
  });

  it('marks mine and builds myPlayers in resolve order with matching names', () => {
    const playerSnap = [
      player({ player_id: 'p1', first_name: 'Alex', last_name: 'Ramirez' }),
      player({ player_id: 'p3', first_name: 'Pat', last_name: 'Kim', team_id: 'jays', team_name: 'Jays' }),
    ];
    const result = assembleLeagueStats(base({
      playerSnap, isAuthed: true, myPlayerIds: new Set(['p3', 'p1']),
    }));
    expect(result.players.filter((p) => p.mine).map((p) => p.playerId).sort()).toEqual(['p1', 'p3']);
    expect(result.myPlayers.map((m) => m.playerId)).toEqual(['p3', 'p1']);
    expect(result.myPlayers[0]).toEqual({ playerId: 'p3', name: 'Pat Kim', teamName: 'Jays' });
  });

  it('ourTeam marks the active team only for non-player authed viewers', () => {
    const playerSnap = [
      player({ player_id: 'p1' }),
      player({ player_id: 'p3', team_id: 'jays', team_name: 'Jays' }),
    ];
    const activeTeam = { id: 'reds', name: 'Reds' };
    const ours = (over: Record<string, unknown>) =>
      assembleLeagueStats(base({ playerSnap, activeTeam, ...over })).players.filter((p) => p.ourTeam).map((p) => p.playerId);
    expect(ours({ isAuthed: true })).toEqual(['p1']);
    expect(ours({ isAuthed: false })).toEqual([]);
    expect(ours({ isAuthed: true, myPlayerIds: new Set(['p3']) })).toEqual([]);
  });

  it('a public viewer cannot be given a my-player card for an opted-out player', () => {
    const playerSnap = [player({ player_id: 'p2', last_name: 'Zzyzxlee', public_opt_out: true })];
    const result = assembleLeagueStats(base({ playerSnap, myPlayerIds: new Set(['p2']) }));
    expect(JSON.stringify(result)).not.toContain('Zzyzxlee');
    expect(result.myPlayers).toEqual([]);
  });
});

describe('resolveMyPlayerIds', () => {
  it('keeps only ids present in this league\'s snapshot, own first, deduped', () => {
    const snap = new Set(['a', 'b', 'c']);
    expect(resolveMyPlayerIds(['a', 'x'], ['b', 'a', 'y', 'c'], snap)).toEqual(['a', 'b', 'c']);
  });
});
