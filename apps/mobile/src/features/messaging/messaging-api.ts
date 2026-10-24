import { z } from 'zod';
import { useQuery } from '@tanstack/react-query';
import {
  channelDetailResponseSchema,
  dmCandidatesResponseSchema,
  type ChannelDetailResponse,
  type CreateTeamChannelInput,
  type DmCandidatesResponse,
} from '@baseball/shared';
import { apiClient, type ApiClient } from '../../lib/api-client';

/**
 * Team channel actions the web does with the service role
 * (`/api/m/v1/channels/:id`, `/messages/:id`, `/teams/:teamId/channels|
 * direct-messages|dm-candidates`). Online-only. Messages themselves stay in
 * WatermelonDB: these change the server, then a sync brings the change in.
 */

export type NewChannelFields = Omit<CreateTeamChannelInput, 'teamId'>;

const channelPath = (channelId: string) => `/channels/${encodeURIComponent(channelId)}`;
const teamPath = (teamId: string) => `/teams/${encodeURIComponent(teamId)}`;
const channelIdResult = z.object({ channelId: z.string() });

export const channelDetailQueryKey = (channelId: string) => ['channels', channelId] as const;
export const dmCandidatesQueryKey = (teamId: string) => ['teams', teamId, 'dm-candidates'] as const;

/** Also marks the channel read, as opening it on the web does. */
export function fetchChannelDetail(channelId: string, client: ApiClient = apiClient): Promise<ChannelDetailResponse> {
  return client.get(channelPath(channelId), channelDetailResponseSchema);
}

export function deleteChannel(channelId: string, client: ApiClient = apiClient) {
  return client.delete(channelPath(channelId), channelIdResult);
}

export function deleteMessage(messageId: string, client: ApiClient = apiClient) {
  return client.delete(`/messages/${encodeURIComponent(messageId)}`, z.object({ messageId: z.string() }));
}

export function createChannel(teamId: string, fields: NewChannelFields, client: ApiClient = apiClient) {
  return client.post(`${teamPath(teamId)}/channels`, fields, channelIdResult);
}

export function fetchDmCandidates(teamId: string, client: ApiClient = apiClient): Promise<DmCandidatesResponse> {
  return client.get(`${teamPath(teamId)}/dm-candidates`, dmCandidatesResponseSchema);
}

export function startDirectMessage(teamId: string, targetUserId: string, client: ApiClient = apiClient) {
  return client.post(`${teamPath(teamId)}/direct-messages`, { targetUserId }, channelIdResult);
}

export function useChannelDetail(channelId: string) {
  return useQuery({
    queryKey: channelDetailQueryKey(channelId),
    queryFn: () => fetchChannelDetail(channelId),
    enabled: channelId.length > 0,
  });
}

export function useDmCandidates(teamId: string | undefined) {
  return useQuery({
    queryKey: dmCandidatesQueryKey(teamId ?? ''),
    queryFn: () => fetchDmCandidates(teamId ?? ''),
    enabled: Boolean(teamId),
  });
}
