import {
  defaultLeagueScoringSettings,
  leagueScoringSettingsSchema,
  mergeWithDefaults,
} from '../league-scoring-settings';

describe('defaultLeagueScoringSettings', () => {
  it('preserves the already-shipped behavior by defaulting expanded lineups to ON', () => {
    const d = defaultLeagueScoringSettings();
    expect(d.lineup.allowExpanded).toBe(true);
    expect(d.lineup.allowMidGameExtension).toBe(true);
    expect(d.lineup.maxBatters).toBe(30);
  });

  it('defaults all new behaviors to OFF', () => {
    const d = defaultLeagueScoringSettings();
    expect(d.lineup.continuousBattingOrder).toBe(false);
    expect(d.guests.allowed).toBe(false);
    expect(d.gameLength.mercy.enabled).toBe(false);
    expect(d.gameLength.runCap.enabled).toBe(false);
    expect(d.gameLength.tiebreakerExtras.enabled).toBe(false);
    expect(d.substitutions.courtesyRunnerForCatcherPitcher).toBe(false);
  });

  it('defaults dropped third strike to ON (OBR standard)', () => {
    expect(defaultLeagueScoringSettings().rules.droppedThirdStrike).toBe(true);
  });

  it('passes its own Zod schema', () => {
    expect(() => leagueScoringSettingsSchema.parse(defaultLeagueScoringSettings())).not.toThrow();
  });
});

describe('mergeWithDefaults', () => {
  it('returns full defaults for empty input', () => {
    expect(mergeWithDefaults({})).toEqual(defaultLeagueScoringSettings());
  });

  it('returns full defaults for null / non-object input', () => {
    expect(mergeWithDefaults(null)).toEqual(defaultLeagueScoringSettings());
    expect(mergeWithDefaults('nope')).toEqual(defaultLeagueScoringSettings());
    expect(mergeWithDefaults([1, 2])).toEqual(defaultLeagueScoringSettings());
  });

  it('keeps explicit overrides while filling in missing subtrees', () => {
    const merged = mergeWithDefaults({
      lineup: { allowExpanded: false, maxBatters: 12 },
    });
    expect(merged.lineup.allowExpanded).toBe(false);
    expect(merged.lineup.maxBatters).toBe(12);
    expect(merged.lineup.allowMidGameExtension).toBe(true); // default preserved
    expect(merged.gameLength.maxInnings).toBe(9); // untouched subtree → default
  });

  it('drops malformed nested values silently', () => {
    const merged = mergeWithDefaults({
      gameLength: { maxInnings: 'seven' },
    });
    expect(merged.gameLength.maxInnings).toBe(9);
  });

  it('clamps out-of-range integers', () => {
    const merged = mergeWithDefaults({ gameLength: { maxInnings: 99 } });
    expect(merged.gameLength.maxInnings).toBe(15);
  });

  it('preserves nullable string fields', () => {
    const merged = mergeWithDefaults({
      compliance: { defaultPitchRuleId: '11111111-1111-1111-1111-111111111111' },
    });
    expect(merged.compliance.defaultPitchRuleId).toBe('11111111-1111-1111-1111-111111111111');
  });
});

describe('leagueScoringSettingsSchema', () => {
  it('rejects unknown top-level keys', () => {
    const bad = { ...defaultLeagueScoringSettings(), wat: true };
    expect(() => leagueScoringSettingsSchema.parse(bad)).toThrow();
  });

  it('rejects out-of-range maxBatters', () => {
    const bad = defaultLeagueScoringSettings();
    bad.lineup.maxBatters = 5;
    expect(() => leagueScoringSettingsSchema.parse(bad)).toThrow();
  });
});
