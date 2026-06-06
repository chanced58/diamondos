import { groupStandingsByDivision } from '../standings-divisions';

type Row = { team_name: string; division_id: string | null };

const rows: Row[] = [
  { team_name: 'Alpha', division_id: 'd-west' },
  { team_name: 'Bravo', division_id: 'd-white' },
  { team_name: 'Charlie', division_id: 'd-west' },
  { team_name: 'Delta', division_id: null },
];

const divisions = [
  { id: 'd-white', name: 'Whitepine' },
  { id: 'd-west', name: 'Western' },
];

describe('groupStandingsByDivision', () => {
  it('groups rows under their division', () => {
    const out = groupStandingsByDivision(rows, divisions);
    const western = out.find((g) => g.id === 'd-west');
    expect(western?.rows.map((r) => r.team_name)).toEqual(['Alpha', 'Charlie']);
    expect(out.find((g) => g.id === 'd-white')?.rows.map((r) => r.team_name)).toEqual(['Bravo']);
  });

  it('orders divisions alphabetically by name', () => {
    const out = groupStandingsByDivision(rows, divisions);
    expect(out.map((g) => g.name)).toEqual(['Western', 'Whitepine']);
  });

  it('preserves the incoming row order within a division', () => {
    const reordered: Row[] = [
      { team_name: 'Charlie', division_id: 'd-west' },
      { team_name: 'Alpha', division_id: 'd-west' },
    ];
    const out = groupStandingsByDivision(reordered, divisions);
    expect(out.find((g) => g.id === 'd-west')?.rows.map((r) => r.team_name)).toEqual(['Charlie', 'Alpha']);
  });

  it('excludes rows with no division (overall table only)', () => {
    const out = groupStandingsByDivision(rows, divisions);
    const all = out.flatMap((g) => g.rows.map((r) => r.team_name));
    expect(all).not.toContain('Delta');
  });

  it('omits divisions that have no rows', () => {
    const out = groupStandingsByDivision(
      [{ team_name: 'Alpha', division_id: 'd-west' }],
      divisions,
    );
    expect(out.map((g) => g.id)).toEqual(['d-west']);
  });

  it('returns an empty array when the league has no divisions', () => {
    expect(groupStandingsByDivision(rows, [])).toEqual([]);
  });
});
