import { z } from 'zod';

/**
 * Contracts for a team's seasons (the web team admin Seasons page), shared by
 * the web actions and the mobile `/api/m/v1/teams/:teamId/seasons` routes.
 * Head coaches, assistants, athletic directors and platform admins manage
 * them.
 */

const uuid = z.string().uuid();

/** The seasons a team creates, each with fixed dates in its year. */
export const SEASON_TERMS = ['Spring', 'Summer', 'Fall'] as const;
export type SeasonTerm = (typeof SEASON_TERMS)[number];

const TERM_DATES: Record<SeasonTerm, { start: string; end: string }> = {
  Spring: { start: '03-01', end: '05-31' },
  Summer: { start: '06-01', end: '08-31' },
  Fall: { start: '09-01', end: '11-30' },
};

/** A season's name and its first and last days (`YYYY-MM-DD`), e.g. Spring 2027 is March 1 to May 31. */
export function seasonFor(term: SeasonTerm, year: number): { name: string; startDate: string; endDate: string } {
  const dates = TERM_DATES[term];
  return { name: `${term} ${year}`, startDate: `${year}-${dates.start}`, endDate: `${year}-${dates.end}` };
}

export const teamSeasonsInputSchema = z.object({ teamId: uuid });
export type TeamSeasonsInput = z.infer<typeof teamSeasonsInputSchema>;

export const createSeasonInputSchema = z.object({
  teamId: uuid,
  term: z.enum(SEASON_TERMS, { errorMap: () => ({ message: 'Pick Spring, Summer or Fall.' }) }),
  year: z.number().int().min(2000, 'Pick a year from 2000 to 2100.').max(2100, 'Pick a year from 2000 to 2100.'),
});
export type CreateTeamSeasonInput = z.infer<typeof createSeasonInputSchema>;

export const seasonIdInputSchema = z.object({ teamId: uuid, seasonId: uuid });
export type SeasonIdInput = z.infer<typeof seasonIdInputSchema>;

export const teamSeasonSchema = z.object({
  seasonId: z.string(),
  name: z.string(),
  startDate: z.string(),
  endDate: z.string().nullable(),
  isActive: z.boolean(),
});
export type TeamSeason = z.infer<typeof teamSeasonSchema>;

/** A team's seasons, newest first. */
export const teamSeasonsResponseSchema = z.object({ seasons: z.array(teamSeasonSchema) });
export type TeamSeasonsResponse = z.infer<typeof teamSeasonsResponseSchema>;

/** A created season, and how many of the team's unassigned games it took in. */
export const createSeasonResponseSchema = z.object({ seasonId: z.string(), gamesAttached: z.number().int() });
export type CreateSeasonResponse = z.infer<typeof createSeasonResponseSchema>;

export const seasonWriteResponseSchema = z.object({ ok: z.literal(true) });
export type SeasonWriteResponse = z.infer<typeof seasonWriteResponseSchema>;
