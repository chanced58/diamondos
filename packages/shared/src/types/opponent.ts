import { PlayerPosition, BatsThrows } from './player';

export interface OpponentTeam {
  id: string;
  /** The platform team that maintains this opponent record. */
  teamId: string;
  name: string;
  abbreviation?: string;
  city?: string;
  stateCode?: string;
  logoUrl?: string;
  notes?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface OpponentPlayer {
  id: string;
  opponentTeamId: string;
  firstName: string;
  lastName: string;
  jerseyNumber?: string;
  primaryPosition?: PlayerPosition;
  bats?: BatsThrows;
  throws?: BatsThrows;
  notes?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface OpponentGameLineup {
  id: string;
  gameId: string;
  opponentPlayerId: string;
  battingOrder?: number;
  startingPosition?: PlayerPosition;
  isStarter: boolean;
  createdAt: string;
}
