import { PlayerPosition } from './player';

export enum GameStatus {
  SCHEDULED = 'scheduled',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  POSTPONED = 'postponed',
}

export enum GameLocationType {
  HOME = 'home',
  AWAY = 'away',
  NEUTRAL = 'neutral',
}

export interface Game {
  id: string;
  seasonId: string;
  teamId: string;
  opponentName: string;
  /** Optional FK to a structured opponent_teams record. */
  opponentTeamId?: string;
  scheduledAt: string;
  locationType: GameLocationType;
  venueName?: string;
  status: GameStatus;
  homeScore: number;
  awayScore: number;
  currentInning: number;
  isTopOfInning: boolean;
  outs: number;
  notes?: string;
  startedAt?: string;
  completedAt?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface GameLineup {
  id: string;
  gameId: string;
  playerId: string;
  battingOrder: number;
  startingPosition?: PlayerPosition;
  isStarter: boolean;
  createdAt: string;
}

/** Derived in-memory game state computed from replaying GameEvents */
export interface LiveGameState {
  gameId: string;
  inning: number;
  isTopOfInning: boolean;
  outs: number;
  balls: number;
  strikes: number;
  homeScore: number;
  awayScore: number;
  runnersOnBase: {
    first: string | null;   // playerId or null
    second: string | null;
    third: string | null;
  };
  currentBatterId: string | null;
  currentPitcherId: string | null;
  currentPitcherPitchCount: number;
}
