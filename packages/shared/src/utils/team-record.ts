/** A team's W-L-T record. */
export interface TeamRecordCounts {
  wins: number;
  losses: number;
  ties: number;
}

/**
 * Winning percentage, ties counted as games (the Team Comparison tables, web
 * and mobile); 0 with no games played.
 */
export function winPct(record: TeamRecordCounts): number {
  const games = record.wins + record.losses + record.ties;
  return games > 0 ? record.wins / games : 0;
}
