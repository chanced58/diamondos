import { getTournamentReview, parseTournamentFormData } from '../tournament-form';

function baseForm(): FormData {
  const form = new FormData();
  form.set('name', 'Fall Classic');
  form.set('startDate', '2026-10-20');
  form.set('endDate', '2026-10-22');
  form.set('requestId', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  form.set('teamType', 'existing');
  form.set('teamId', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
  return form;
}

describe('parseTournamentFormData', () => {
  it('preserves the selected existing team and defaults unchecked lineup choices to false', () => {
    const parsed = parseTournamentFormData(baseForm());
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.team).toEqual({ type: 'existing', teamId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' });
      expect(parsed.data.lineup).toEqual({ allowExpanded: false, maxBatters: undefined, allowMidGameChanges: false });
    }
  });

  it('reads tournament-team fields and expands the lineup cap only when selected', () => {
    const form = baseForm();
    form.set('teamType', 'new');
    form.set('teamName', 'Tournament Team');
    form.set('organization', 'DiamondOS');
    form.set('stateCode', 'tx');
    form.set('allowExpanded', 'on');
    form.set('maxBatters', '12');
    form.set('allowMidGameChanges', 'on');
    const parsed = parseTournamentFormData(form);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.team).toEqual({ type: 'new', name: 'Tournament Team', organization: 'DiamondOS', stateCode: 'TX' });
      expect(parsed.data.lineup).toEqual({ allowExpanded: true, maxBatters: 12, allowMidGameChanges: true });
    }
  });

  it('rejects a non-integer expanded lineup cap', () => {
    const form = baseForm();
    form.set('allowExpanded', 'on');
    form.set('maxBatters', '12.5');
    expect(parseTournamentFormData(form).success).toBe(false);
  });
});

describe('getTournamentReview', () => {
  const teams = [{ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: 'Lions', organization: null, stateCode: null, role: 'head_coach' }];

  it('summarizes the selected team and the nine-batter default before submission', () => {
    expect(getTournamentReview(baseForm(), teams)).toEqual({
      team: 'Lions', battingOrder: 'Up to 9 batters', midGameChanges: 'Not allowed',
    });
  });

  it('summarizes a newly named team and the independently selected mid-game permission', () => {
    const form = baseForm();
    form.set('teamType', 'new');
    form.set('teamName', ' Weekend Stars ');
    form.set('allowMidGameChanges', 'on');
    expect(getTournamentReview(form, teams)).toEqual({
      team: 'Weekend Stars (new tournament team)', battingOrder: 'Up to 9 batters', midGameChanges: 'Expansion and contraction allowed',
    });
  });

  it('shows the chosen expanded cap without enabling mid-game changes', () => {
    const form = baseForm();
    form.set('allowExpanded', 'on');
    form.set('maxBatters', '30');
    expect(getTournamentReview(form, teams).battingOrder).toBe('Up to 30 batters');
    expect(getTournamentReview(form, teams).midGameChanges).toBe('Not allowed');
  });
});
