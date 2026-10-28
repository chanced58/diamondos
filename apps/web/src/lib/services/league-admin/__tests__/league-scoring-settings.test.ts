import { defaultLeagueScoringSettings } from '@baseball/shared';
import { loadLeagueScoringSettings, saveLeagueScoringSettings } from '../league-scoring-settings';
import { fakeDb, type FakeResult } from '../../__tests__/fake-db';

const LEAGUE = '11111111-1111-4111-8111-111111111111';
const RULE = '44444444-4444-4444-8444-444444444444';

const staff = (role: string | null): FakeResult => ({
  data: role ? { role, leagues: { id: LEAGUE, name: 'Valley League' } } : null,
});

function settingsWith(overrides: { dualScorekeeper?: boolean; defaultPitchRuleId?: string | null } = {}) {
  const settings = defaultLeagueScoringSettings();
  settings.scorekeeping.dualScorekeeper = overrides.dualScorekeeper ?? false;
  settings.compliance.defaultPitchRuleId = overrides.defaultPitchRuleId ?? null;
  return settings;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('loadLeagueScoringSettings', () => {
  it('should merge the saved settings with the defaults and list the system rulesets for a manager', async () => {
    const { db, calls } = fakeDb({
      'league_staff.select': staff('league_manager'),
      'leagues.select': { data: { scoring_settings: { gameLength: { maxInnings: 7 }, scorekeeping: { dualScorekeeper: true } } } },
      'pitch_compliance_rules.select': {
        data: [
          { id: RULE, rule_name: 'NFHS', age_min: 13, age_max: 18 },
          { id: 'r2', rule_name: 'Custom', age_min: null, age_max: null },
        ],
      },
    });
    const result = await loadLeagueScoringSettings(db, 'u1', { leagueId: LEAGUE });
    expect(result).toMatchObject({
      ok: true,
      data: {
        league: { id: LEAGUE, name: 'Valley League' },
        canEdit: false,
        pitchRuleOptions: [
          { id: RULE, label: 'NFHS (ages 13–18)' },
          { id: 'r2', label: 'Custom' },
        ],
      },
    });
    if (!result.ok) throw new Error('expected ok');
    expect(result.data.settings.gameLength.maxInnings).toBe(7);
    expect(result.data.settings.gameLength.mercy).toEqual(defaultLeagueScoringSettings().gameLength.mercy);
    expect(result.data.settings.scorekeeping.dualScorekeeper).toBe(true);
    expect(calls.find((c) => c.table === 'pitch_compliance_rules')?.filters).toEqual({ 'team_id is': null, is_active: true });
  });

  it('should fail rather than hand back defaults when the settings can’t be read', async () => {
    const { db } = fakeDb({
      'league_staff.select': staff('league_admin'),
      'leagues.select': { error: { message: 'boom' } },
      'pitch_compliance_rules.select': { data: [] },
    });
    expect(await loadLeagueScoringSettings(db, 'u1', { leagueId: LEAGUE })).toMatchObject({ code: 'failed' });
  });

  it('should hide the league from anyone off its staff', async () => {
    const { db } = fakeDb({ 'league_staff.select': staff(null) });
    expect(await loadLeagueScoringSettings(db, 'u1', { leagueId: LEAGUE })).toMatchObject({ code: 'not_found' });
  });
});

describe('saveLeagueScoringSettings', () => {
  it('should save the whole blob for a league admin, on that league only', async () => {
    const settings = settingsWith({ dualScorekeeper: true, defaultPitchRuleId: RULE });
    const { db, calls } = fakeDb({
      'league_staff.select': staff('league_admin'),
      'pitch_compliance_rules.select': { data: { id: RULE } },
      'leagues.update': { data: [{ id: LEAGUE }] },
    });
    expect(await saveLeagueScoringSettings(db, 'u1', { leagueId: LEAGUE, settings })).toEqual({ ok: true, data: { settings } });
    const update = calls.find((c) => c.op === 'update');
    expect(update?.payload).toEqual({ scoring_settings: settings });
    expect(update?.filters).toEqual({ id: LEAGUE });
    expect(calls.find((c) => c.table === 'pitch_compliance_rules')?.filters).toEqual({ id: RULE, 'team_id is': null });
  });

  it('should refuse league managers without touching the league', async () => {
    const { db, calls } = fakeDb({ 'league_staff.select': staff('league_manager') });
    expect(await saveLeagueScoringSettings(db, 'u1', { leagueId: LEAGUE, settings: settingsWith() })).toMatchObject({
      code: 'forbidden',
      error: 'Only league admins can change the scoring settings.',
    });
    expect(calls.some((c) => c.table === 'leagues')).toBe(false);
  });

  it('should refuse settings out of range, or with keys the schema doesn’t know', async () => {
    const { db, calls } = fakeDb({ 'league_staff.select': staff('league_admin') });
    const tooLong = settingsWith();
    tooLong.gameLength.maxInnings = 40;
    expect(await saveLeagueScoringSettings(db, 'u1', { leagueId: LEAGUE, settings: tooLong })).toMatchObject({ code: 'invalid' });
    const extra = { ...settingsWith(), surprise: true };
    expect(await saveLeagueScoringSettings(db, 'u1', { leagueId: LEAGUE, settings: extra })).toMatchObject({ code: 'invalid' });
    expect(calls.some((c) => c.table === 'leagues')).toBe(false);
  });

  it('should refuse a default ruleset that isn’t a system one', async () => {
    const { db, calls } = fakeDb({
      'league_staff.select': staff('league_admin'),
      'pitch_compliance_rules.select': { data: null },
    });
    expect(
      await saveLeagueScoringSettings(db, 'u1', { leagueId: LEAGUE, settings: settingsWith({ defaultPitchRuleId: RULE }) }),
    ).toMatchObject({ code: 'invalid', error: 'Pick one of the pitch-count rulesets.' });
    expect(calls.some((c) => c.table === 'leagues')).toBe(false);
  });

  it('should report a league that no longer exists', async () => {
    const { db } = fakeDb({ 'league_staff.select': staff('league_admin'), 'leagues.update': { data: [] } });
    expect(await saveLeagueScoringSettings(db, 'u1', { leagueId: LEAGUE, settings: settingsWith() })).toMatchObject({ code: 'not_found' });
  });
});
