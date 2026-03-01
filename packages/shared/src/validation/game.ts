import { z } from 'zod';
import { GameLocationType } from '../types/game';
import { EventType, PitchType, PitchOutcome, HitType } from '../types/game-event';

export const createGameSchema = z.object({
  opponentName: z.string().min(1, 'Opponent name is required').max(100),
  scheduledAt: z.string().datetime(),
  locationType: z.nativeEnum(GameLocationType),
  venueName: z.string().max(100).optional(),
  notes: z.string().max(500).optional(),
});

export const gameEventSchema = z.object({
  id: z.string().uuid(),
  gameId: z.string().uuid(),
  sequenceNumber: z.number().int().min(1),
  eventType: z.nativeEnum(EventType),
  inning: z.number().int().min(1).max(20),
  isTopOfInning: z.boolean(),
  payload: z.record(z.unknown()),
  occurredAt: z.string().datetime(),
  deviceId: z.string().uuid(),
});

export const pitchThrownPayloadSchema = z.object({
  pitcherId: z.string().uuid(),
  batterId: z.string().uuid(),
  pitchType: z.nativeEnum(PitchType).optional(),
  outcome: z.nativeEnum(PitchOutcome),
  velocity: z.number().min(0).max(120).optional(),
  zoneLocation: z.number().int().min(0).max(9).optional(),
});

export const hitPayloadSchema = z.object({
  batterId: z.string().uuid(),
  pitcherId: z.string().uuid(),
  hitType: z.nativeEnum(HitType),
  sprayX: z.number().min(0).max(1).optional(),
  sprayY: z.number().min(0).max(1).optional(),
  rbis: z.number().int().min(0).max(4).optional(),
});

export type CreateGameInput = z.infer<typeof createGameSchema>;
export type GameEventInput = z.infer<typeof gameEventSchema>;
