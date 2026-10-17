export type TournamentStatus = 'active' | 'completed' | 'archived';

export type TournamentTeamSelection =
  | { type: 'existing'; teamId: string }
  | { type: 'new'; name: string; organization?: string; stateCode?: string };

export interface TournamentCreationResult {
  tournamentId: string;
  teamId: string;
  seasonId: string;
}
