export type GameRsvpStatus = 'attending' | 'not_attending' | 'maybe';

export const GAME_RSVP_STATUSES: readonly GameRsvpStatus[] = [
  'attending',
  'not_attending',
  'maybe',
] as const;

export interface GameRsvp {
  id: string;
  gameId: string;
  playerId: string;
  userId: string;
  status: GameRsvpStatus;
  note: string | null;
  respondedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface GameRsvpSummary {
  attending: number;
  notAttending: number;
  maybe: number;
  pending: number;
  total: number;
}
