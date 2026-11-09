import { z } from 'zod';
import { isValidTimeZone } from '../utils/date';

/**
 * Contracts for shared league games: games a league schedules between two of
 * its teams, plus hand-entered results and unknown-player placeholder
 * resolution. Used by the web services and the `/api/m/v1` routes.
 */

const uuid = z.string().uuid();
const count = z.number().int().min(0);
const inningRuns = z.array(count).min(1);

const gameDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD.');
const gameTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Time must be HH:MM.');
const timeZone = z.string().refine(isValidTimeZone, 'Unknown time zone.');
const venueName = z.string().trim().min(1).max(200);

// ── Games ────────────────────────────────────────────────────────────────────

export const createLeagueGameInputSchema = z
  .object({
    leagueId: uuid,
    homeTeamId: uuid,
    awayTeamId: uuid,
    date: gameDate,
    time: gameTime,
    timeZone,
    venueName: venueName.optional(),
  })
  .strict()
  .refine((input) => input.homeTeamId !== input.awayTeamId, {
    message: 'A team cannot play itself.',
    path: ['awayTeamId'],
  });
export type CreateLeagueGameInput = z.infer<typeof createLeagueGameInputSchema>;

export const updateLeagueGameInputSchema = z
  .object({
    leagueGameId: uuid,
    date: gameDate.optional(),
    time: gameTime.optional(),
    timeZone: timeZone.optional(),
    venueName: venueName.optional(),
  })
  .strict();
export type UpdateLeagueGameInput = z.infer<typeof updateLeagueGameInputSchema>;

export const leagueGameIdInputSchema = z.object({ leagueGameId: uuid }).strict();
export type LeagueGameIdInput = z.infer<typeof leagueGameIdInputSchema>;

export const listLeagueGamesInputSchema = z
  .object({ leagueId: uuid, season: z.string().trim().min(1).max(50).optional() })
  .strict();
export type ListLeagueGamesInput = z.infer<typeof listLeagueGamesInputSchema>;

// ── Hand-entered results ─────────────────────────────────────────────────────

/** Runs are not an input for box and batting results: the service sums the innings. */
const boxShape = {
  leagueGameId: uuid,
  homeInningRuns: inningRuns,
  awayInningRuns: inningRuns,
  homeHits: count,
  awayHits: count,
  homeErrors: count,
  awayErrors: count,
};

export const manualBattingLineSchema = z
  .object({
    teamId: uuid,
    playerId: uuid,
    ab: count,
    r: count,
    h: count,
    doubles: count,
    triples: count,
    hr: count,
    rbi: count,
    bb: count,
    so: count,
    hbp: count,
    sf: count,
    sb: count,
  })
  .strict()
  .superRefine((line, ctx) => {
    if (line.h > line.ab) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['h'], message: 'Hits cannot exceed at-bats.' });
    }
    if (line.doubles + line.triples + line.hr > line.h) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['h'],
        message: 'Hits must cover the doubles, triples and home runs.',
      });
    }
  });
export type ManualBattingLineInput = z.infer<typeof manualBattingLineSchema>;

export const manualResultInputSchema = z
  .discriminatedUnion('kind', [
    z.object({ kind: z.literal('final'), leagueGameId: uuid, homeRuns: count, awayRuns: count }).strict(),
    z.object({ kind: z.literal('box'), ...boxShape }).strict(),
    z
      .object({
        kind: z.literal('batting'),
        ...boxShape,
        lines: z.array(manualBattingLineSchema).max(60),
      })
      .strict(),
    z.object({ kind: z.literal('forfeit'), leagueGameId: uuid, winnerTeamId: uuid }).strict(),
  ])
  .superRefine((input, ctx) => {
    if (input.kind !== 'batting') return;
    const seen = new Set<string>();
    input.lines.forEach((line, index) => {
      if (seen.has(line.playerId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['lines', index, 'playerId'],
          message: 'A player can have only one batting line.',
        });
      }
      seen.add(line.playerId);
    });
  });
export type ManualResultInput = z.infer<typeof manualResultInputSchema>;

// ── Unknown-player placeholders ──────────────────────────────────────────────

export const resolvePlaceholderInputSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('link'), placeholderId: uuid, playerId: uuid }).strict(),
  z
    .object({
      action: z.literal('create'),
      placeholderId: uuid,
      firstName: z.string().trim().min(1, 'First name is required.').max(100),
      lastName: z.string().trim().min(1, 'Last name is required.').max(100),
      jerseyNumber: z.number().int().min(0).max(99).optional(),
    })
    .strict(),
  z.object({ action: z.literal('fill_in'), placeholderId: uuid }).strict(),
]);
export type ResolvePlaceholderInput = z.infer<typeof resolvePlaceholderInputSchema>;

export const listPlaceholdersInputSchema = z.union([
  z.object({ leagueId: uuid }).strict(),
  z.object({ leagueGameId: uuid }).strict(),
]);
export type ListPlaceholdersInput = z.infer<typeof listPlaceholdersInputSchema>;
