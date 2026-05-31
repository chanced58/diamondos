export interface SpotlightCandidate {
  id: string; name: string; teamName?: string; score: number; qualifierValue: number;
}
export interface SpotlightInput { batters: SpotlightCandidate[]; teams: SpotlightCandidate[]; minBatterQualifier: number; }
export interface Spotlights { playerOfWeek: SpotlightCandidate | null; hotTeam: SpotlightCandidate | null; }

function topByScore(list: SpotlightCandidate[]): SpotlightCandidate | null {
  return list.reduce<SpotlightCandidate | null>((best, c) => (best === null || c.score > best.score ? c : best), null);
}

export function selectSpotlights(input: SpotlightInput): Spotlights {
  const qualifiedBatters = input.batters.filter((b) => b.qualifierValue >= input.minBatterQualifier);
  return { playerOfWeek: topByScore(qualifiedBatters), hotTeam: topByScore(input.teams) };
}
