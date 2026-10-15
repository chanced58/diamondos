import { listPitchersWithUsage } from '@baseball/database';
import { PitcherAvailabilityStatus } from '@baseball/shared';

function dbWithCounts() {
  const rows: Record<string, Record<string, unknown>[]> = {
    players: [{ id: 'pitcher', team_id: 'team', is_active: true, first_name: 'Alex', last_name: 'Pitcher', primary_position: 'pitcher' }],
    pitch_compliance_rules: [{ id: 'rule', rule_name: 'Rest test', team_id: 'team', is_active: true, max_pitches_per_day: 100, rest_day_thresholds: { '0': 0, '21': 1, '41': 2, '61': 4 } }],
    pitch_counts: [
      { player_id: 'pitcher', team_id: 'team', season_id: 'regular', game_date: '2026-10-19', pitch_count: 70 },
      { player_id: 'pitcher', team_id: 'team', season_id: 'tournament', game_date: '2026-10-20', pitch_count: 15 },
    ],
  };
  return {
    from(table: string) {
      let values = rows[table] ?? [];
      const query = {
        select() { return query; },
        eq(key: string, value: unknown) { values = values.filter((row) => row[key] === value); return query; },
        in(key: string, list: unknown[]) { values = values.filter((row) => list.includes(row[key])); return query; },
        gte(key: string, value: string) { values = values.filter((row) => String(row[key]) >= value); return query; },
        lte(key: string, value: string) { values = values.filter((row) => String(row[key]) <= value); return query; },
        or() { return query; }, order() { return query; }, limit() { return query; }, range() { return query; },
        then(resolve: (result: unknown) => unknown) { return Promise.resolve(resolve({ data: values, error: null })); },
      };
      return query;
    },
  };
}

it('keeps the longer regular-season rest window after a lighter tournament outing', async () => {
  const plan = await listPitchersWithUsage(dbWithCounts() as never, 'team', new Date('2026-10-21T12:00:00Z'));
  expect(plan.pitchers[0].availability.status).toBe(PitcherAvailabilityStatus.UNAVAILABLE);
  expect(plan.pitchers[0].availability.pitchesLast7d).toBe(85);
  expect(plan.pitchers[0].availability.nextAvailableDate).toBe('2026-10-24');
});
