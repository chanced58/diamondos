export interface ScoringConfig {
  pitchTypeEnabled: boolean;
  pitchLocationEnabled: boolean;
}

export const DEFAULT_SCORING_CONFIG: ScoringConfig = {
  pitchTypeEnabled: true,
  pitchLocationEnabled: true,
};

/**
 * Reads the per-game scoring-annotation config back out of a GAME_START
 * payload. Every flag defaults to enabled when absent/non-boolean — matches
 * web's `gsp.pitchTypeEnabled !== false` read-back so games started before
 * this feature shipped, or started from the other platform with fields
 * omitted, still get the full annotation UI.
 *
 * Both flags are purely informational on mobile — showing/hiding the
 * pitch-type chips and pitch-location grid — and never block recording a
 * pitch, even when enabled.
 */
export function deriveScoringConfig(
  gameStartPayload: Record<string, unknown> | null | undefined,
): ScoringConfig {
  const p = gameStartPayload ?? {};
  return {
    pitchTypeEnabled: p.pitchTypeEnabled !== false,
    pitchLocationEnabled: p.pitchLocationEnabled !== false,
  };
}
