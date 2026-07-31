export const GAME_RSVP_STATUSES = ['attending', 'not_attending', 'maybe'] as const;

export type GameRsvpStatus = (typeof GAME_RSVP_STATUSES)[number];

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
