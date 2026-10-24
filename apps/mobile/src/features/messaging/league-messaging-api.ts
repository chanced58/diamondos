import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  leagueChannelDetailResponseSchema,
  leagueChannelsResponseSchema,
  type LeagueChannelDetailResponse,
  type LeagueChannelsResponse,
} from '@baseball/shared';
import { apiClient, type ApiClient } from '../../lib/api-client';
import { getSupabaseClient } from '../../lib/supabase';

/**
 * League channels: online-only, with no WatermelonDB mirror. Reads go through
 * `/api/m/v1` (the senders sit on other teams, whose names RLS hides);
 * posting is a direct insert under RLS, as on the web.
 */

export const leagueChannelsQueryKey = (teamId: string) => ['teams', teamId, 'league-channels'] as const;
export const leagueChannelQueryKey = (leagueChannelId: string) => ['league-channels', leagueChannelId] as const;

export function fetchLeagueChannels(teamId: string, client: ApiClient = apiClient): Promise<LeagueChannelsResponse> {
  return client.get(`/teams/${encodeURIComponent(teamId)}/league-channels`, leagueChannelsResponseSchema);
}

/** Also marks the channel read, as opening it on the web does. */
export function fetchLeagueChannel(leagueChannelId: string, client: ApiClient = apiClient): Promise<LeagueChannelDetailResponse> {
  return client.get(`/league-channels/${encodeURIComponent(leagueChannelId)}`, leagueChannelDetailResponseSchema);
}

/** Throws the database error; the screen shows a generic message, so the detail is logged here. */
export async function postLeagueMessage(leagueChannelId: string, senderId: string, body: string): Promise<void> {
  const { error } = await getSupabaseClient()
    .from('league_messages')
    .insert({ league_channel_id: leagueChannelId, sender_id: senderId, body });
  if (!error) return;
  console.warn(`[postLeagueMessage] channel=${leagueChannelId} sender=${senderId} failed:`, error);
  throw error;
}

export function useLeagueChannels(teamId: string | undefined) {
  return useQuery({
    queryKey: leagueChannelsQueryKey(teamId ?? ''),
    queryFn: () => fetchLeagueChannels(teamId ?? ''),
    enabled: Boolean(teamId),
  });
}

export function useLeagueChannel(leagueChannelId: string) {
  return useQuery({
    queryKey: leagueChannelQueryKey(leagueChannelId),
    queryFn: () => fetchLeagueChannel(leagueChannelId),
    enabled: leagueChannelId.length > 0,
  });
}

/**
 * Refetch an open league channel whenever a message in it is posted or
 * changed elsewhere (Supabase Realtime, which RLS opens to channel members;
 * the web listens the same way). Refetching rather than writing the row
 * keeps the server's sender names and its rule for what is shown.
 */
export function useLeagueChannelRealtime(leagueChannelId: string): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!leagueChannelId) return;
    const supabase = getSupabaseClient();
    const filter = `league_channel_id=eq.${leagueChannelId}`;
    const refetch = () => void queryClient.invalidateQueries({ queryKey: leagueChannelQueryKey(leagueChannelId) });
    const channel = supabase
      .channel(`league-messages-${leagueChannelId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'league_messages', filter }, refetch)
      // An edit or a deletion (deleted_at is an update).
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'league_messages', filter }, refetch)
      .subscribe((status) => {
        // Anything posted between the first fetch and the subscription opening.
        if (status === 'SUBSCRIBED') refetch();
        // Live updates stop until the channel is reopened; say so rather than go quiet.
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn(`[useLeagueChannelRealtime] channel=${leagueChannelId} status=${status}`);
        }
      });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [leagueChannelId, queryClient]);
}
