import { deriveScoringConfig, DEFAULT_SCORING_CONFIG } from '../scoring-config';

describe('deriveScoringConfig', () => {
  it('defaults all flags to true for a null/undefined payload', () => {
    expect(deriveScoringConfig(null)).toEqual(DEFAULT_SCORING_CONFIG);
    expect(deriveScoringConfig(undefined)).toEqual(DEFAULT_SCORING_CONFIG);
  });

  it('defaults all flags to true for an empty payload (legacy GAME_START events)', () => {
    expect(deriveScoringConfig({})).toEqual(DEFAULT_SCORING_CONFIG);
  });

  it('defaults all flags to true for a payload with unrelated fields only', () => {
    expect(deriveScoringConfig({ homeLineupPitcherId: 'p1' })).toEqual(DEFAULT_SCORING_CONFIG);
  });

  it('disables only the flag explicitly set to false', () => {
    expect(deriveScoringConfig({ pitchTypeEnabled: false })).toEqual({
      pitchTypeEnabled: false,
      pitchLocationEnabled: true,
    });
    expect(deriveScoringConfig({ pitchLocationEnabled: false })).toEqual({
      pitchTypeEnabled: true,
      pitchLocationEnabled: false,
    });
  });

  it('respects both flags explicitly set to true', () => {
    expect(
      deriveScoringConfig({ pitchTypeEnabled: true, pitchLocationEnabled: true }),
    ).toEqual(DEFAULT_SCORING_CONFIG);
  });

  it('a non-boolean falsy-looking value does NOT disable the flag (strict !== false semantics)', () => {
    // Matches web's exact operator: only the literal boolean `false` disables.
    expect(deriveScoringConfig({ pitchTypeEnabled: 'false' as unknown as boolean }).pitchTypeEnabled).toBe(true);
    expect(deriveScoringConfig({ pitchTypeEnabled: 0 as unknown as boolean }).pitchTypeEnabled).toBe(true);
    expect(deriveScoringConfig({ pitchTypeEnabled: null as unknown as boolean }).pitchTypeEnabled).toBe(true);
  });
});
