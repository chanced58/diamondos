import { z } from 'zod';

const PLAYER_POSITION = z.enum([
  'pitcher','catcher','first_base','second_base','third_base','shortstop',
  'left_field','center_field','right_field','designated_hitter','utility',
]);

const BATS_THROWS = z.enum(['right','left','switch']);

const uuid = () => z.string().uuid();

const trimmedNonEmpty = (max: number) =>
  z.string().transform((s) => s.trim()).pipe(z.string().min(1).max(max));

const optionalUuid = () =>
  z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    uuid().optional(),
  );

export const createLeaguePlayerSchema = z.object({
  leagueId: uuid(),
  firstName: trimmedNonEmpty(80),
  lastName:  trimmedNonEmpty(80),
  dateOfBirth: z.string().date().optional(),
  jerseyNumber: z.number().int().min(0).max(99).optional(),
  primaryPosition: PLAYER_POSITION.optional(),
  bats: BATS_THROWS.optional(),
  throws: BATS_THROWS.optional(),
  graduationYear: z.number().int().min(1900).max(2100).optional(),
  notes: z.string().max(2000).optional(),
  teamId: optionalUuid(),
});

export type CreateLeaguePlayerInput = z.infer<typeof createLeaguePlayerSchema>;

export const transferPlayerSchema = z.object({
  leagueId: uuid(),
  playerId: uuid(),
  toTeamId: uuid(),
  effectiveAt: z.string().datetime().optional(),
  reason: z.string().max(500).optional(),
  seasonId: optionalUuid(),
  acceptJerseyClear: z.boolean().default(false),
});

export type TransferPlayerInput = z.infer<typeof transferPlayerSchema>;

export const releasePlayerSchema = z.object({
  leagueId: uuid(),
  playerId: uuid(),
  effectiveAt: z.string().datetime().optional(),
  reason: z.string().max(500).optional(),
});

export type ReleasePlayerInput = z.infer<typeof releasePlayerSchema>;

export const updateLeaguePlayerSchema = z.object({
  playerId: uuid(),
  firstName: trimmedNonEmpty(80).optional(),
  lastName:  trimmedNonEmpty(80).optional(),
  dateOfBirth: z.string().date().optional(),
  jerseyNumber: z.number().int().min(0).max(99).nullable().optional(),
  primaryPosition: PLAYER_POSITION.nullable().optional(),
  bats: BATS_THROWS.nullable().optional(),
  throws: BATS_THROWS.nullable().optional(),
  graduationYear: z.number().int().min(1900).max(2100).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export type UpdateLeaguePlayerInput = z.infer<typeof updateLeaguePlayerSchema>;
