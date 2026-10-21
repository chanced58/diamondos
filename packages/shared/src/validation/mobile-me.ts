import { z } from 'zod';
import { Feature, SubscriptionTier } from '../constants/tiers';

/**
 * Contract for `GET /api/m/v1/me` — the mobile app's bootstrap payload.
 *
 * The web route builds it; the mobile app parses it with the same schema, so
 * a web deploy that drifts from the app fails loudly at the boundary instead
 * of rendering half a screen. Unknown keys are stripped (zod's default), so
 * the web can add fields without breaking older apps.
 */
export const MOBILE_API_VERSION = 1;

export const meTeamMembershipSchema = z.object({
  teamId: z.string(),
  teamName: z.string(),
  organization: z.string().nullable(),
  role: z.string(),
  /** The user's own `players` row on this team, if they are a player. */
  playerId: z.string().nullable(),
  /** A team created solely for one tournament (`tournament_teams.is_tournament_only`). */
  isTournamentTeam: z.boolean(),
  tier: z.nativeEnum(SubscriptionTier),
  /**
   * Features the team's tier grants. Unknown values (a newer web adding a
   * feature) are dropped rather than failing the whole payload.
   */
  features: z
    .array(z.string())
    .transform((values) =>
      values.filter((value): value is Feature =>
        (Object.values(Feature) as string[]).includes(value),
      ),
    ),
});

export const meLeagueRoleSchema = z.object({
  leagueId: z.string(),
  leagueName: z.string(),
  leagueSlug: z.string().nullable(),
  role: z.enum(['league_admin', 'league_manager']),
});

export const meResponseSchema = z.object({
  apiVersion: z.number().int(),
  user: z.object({
    id: z.string(),
    email: z.string().nullable(),
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
  }),
  memberships: z.array(meTeamMembershipSchema),
  leagueRoles: z.array(meLeagueRoleSchema),
});

export type MeTeamMembership = z.infer<typeof meTeamMembershipSchema>;
export type MeLeagueRole = z.infer<typeof meLeagueRoleSchema>;
export type MeResponse = z.infer<typeof meResponseSchema>;
