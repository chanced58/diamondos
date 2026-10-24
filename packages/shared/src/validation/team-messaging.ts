import { z } from 'zod';

/**
 * Contracts for the team-channel actions the web does with the service role
 * (`/api/m/v1/channels/:id`, `/api/m/v1/messages/:id`,
 * `/api/m/v1/teams/:teamId/channels|direct-messages|dm-candidates`). Sending a
 * message stays a direct insert under RLS, on the web and on phones.
 */

const uuid = (message: string) => z.string().uuid(message);

export const channelIdInputSchema = z.object({ channelId: uuid('Missing channel.') });
export type ChannelIdInput = z.input<typeof channelIdInputSchema>;

export const messageIdInputSchema = z.object({ messageId: uuid('Missing message.') });
export type MessageIdInput = z.input<typeof messageIdInputSchema>;

/** Coaches create announcement and topic channels; direct channels come from starting a DM. */
export const createTeamChannelInputSchema = z.object({
  teamId: uuid('Missing team.'),
  channelType: z.enum(['announcement', 'topic']),
  name: z.string().trim().min(1, 'Channel name is required.').max(80, 'Channel name is too long.'),
  description: z
    .string()
    .trim()
    .max(300, 'Description is too long.')
    .nullable()
    .optional()
    .transform((value) => (value ? value : null)),
});
export type CreateTeamChannelInput = z.input<typeof createTeamChannelInputSchema>;

export const dmCandidatesInputSchema = z.object({ teamId: uuid('Missing team.') });
export type DmCandidatesInput = z.input<typeof dmCandidatesInputSchema>;

export const startDirectMessageInputSchema = z.object({
  teamId: uuid('Missing team.'),
  targetUserId: uuid('Pick someone to message.'),
});
export type StartDirectMessageInput = z.input<typeof startDirectMessageInputSchema>;

export const channelDetailResponseSchema = z.object({
  channel: z.object({
    id: z.string(),
    teamId: z.string(),
    channelType: z.enum(['announcement', 'topic', 'direct']),
    /** A DM's is the other person's name. */
    displayName: z.string(),
    description: z.string().nullable(),
  }),
  canPost: z.boolean(),
  /** Coaches delete any message and non-DM channels; everyone else their own messages. */
  isCoach: z.boolean(),
  canDeleteChannel: z.boolean(),
  /** Active team roles by user id, for the role badges beside names. */
  memberRoles: z.record(z.string(), z.string()),
});
export type ChannelDetailResponse = z.infer<typeof channelDetailResponseSchema>;

export const dmCandidateSchema = z.object({
  userId: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  role: z.string(),
});
export type DmCandidate = z.infer<typeof dmCandidateSchema>;

export const dmCandidatesResponseSchema = z.object({
  teamId: z.string(),
  /** Active team members you can message, by last name. */
  people: z.array(dmCandidateSchema),
});
export type DmCandidatesResponse = z.infer<typeof dmCandidatesResponseSchema>;
