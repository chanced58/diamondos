import { z } from 'zod';

/**
 * Contracts for league channels on the mobile app
 * (`/api/m/v1/teams/:teamId/league-channels`, `/api/m/v1/league-channels/:id`).
 * The web reads them with the service role because a league channel's
 * members are on different teams, whose names RLS on `user_profiles` hides.
 * Posting stays a direct insert under RLS, on the web and on phones.
 */

const uuid = (message: string) => z.string().uuid(message);
const channelType = z.enum(['announcement', 'topic', 'direct']);

export const leagueChannelsInputSchema = z.object({ teamId: uuid('Missing team.') });
export type LeagueChannelsInput = z.input<typeof leagueChannelsInputSchema>;

export const leagueChannelIdInputSchema = z.object({ leagueChannelId: uuid('Missing channel.') });
export type LeagueChannelIdInput = z.input<typeof leagueChannelIdInputSchema>;

export const leagueChannelSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  channelType,
  description: z.string().nullable(),
  canPost: z.boolean(),
});
export type LeagueChannelSummary = z.infer<typeof leagueChannelSummarySchema>;

export const leagueChannelsResponseSchema = z.object({
  teamId: z.string(),
  /** The team's league; null when it is in none. */
  leagueName: z.string().nullable(),
  /** Only the league channels the caller is a member of, announcements first. */
  channels: z.array(leagueChannelSummarySchema),
});
export type LeagueChannelsResponse = z.infer<typeof leagueChannelsResponseSchema>;

export const leagueMessageSchema = z.object({
  id: z.string(),
  body: z.string(),
  senderId: z.string(),
  senderName: z.string(),
  createdAt: z.string(),
  editedAt: z.string().nullable(),
});
export type LeagueMessage = z.infer<typeof leagueMessageSchema>;

export const leagueChannelDetailResponseSchema = z.object({
  channel: z.object({
    id: z.string(),
    leagueId: z.string(),
    name: z.string(),
    channelType,
    description: z.string().nullable(),
  }),
  canPost: z.boolean(),
  /** The latest messages (deleted ones left out), oldest first. */
  messages: z.array(leagueMessageSchema),
});
export type LeagueChannelDetailResponse = z.infer<typeof leagueChannelDetailResponseSchema>;
