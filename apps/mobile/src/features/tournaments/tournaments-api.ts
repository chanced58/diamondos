import { useQuery } from '@tanstack/react-query';
import { createTournament as createTournamentRpc, getTournamentTeamOptions, type TournamentTeamOption } from '@baseball/database';
import { tournamentDetailResponseSchema, type CreateTournamentInput, type TournamentDetailResponse } from '@baseball/shared';
import { getSupabaseClient } from '../../lib/supabase';
import { apiClient, type ApiClient } from '../../lib/api-client';

/**
 * Tournaments, online-only. The list and create go straight to Supabase, as
 * the web does: RLS decides which tournaments the user sees, and the
 * `create_tournament` RPC checks who may enter which team. The detail (stats
 * included) comes from `/api/m/v1`, the web page's loader.
 */

export interface TournamentSummary {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: string;
}

/** Cache key for the tournament list. */
export const tournamentsQueryKey = ['tournaments'] as const;
/** Cache key for one tournament. */
export const tournamentQueryKey = (tournamentId: string) => ['tournaments', tournamentId] as const;
/** Cache key for the teams the user may enter. */
export const tournamentTeamOptionsQueryKey = (userId: string) => ['tournaments', 'team-options', userId] as const;

/** Every tournament the user can see, newest first (the web list). */
export async function fetchTournaments(): Promise<TournamentSummary[]> {
  const { data, error } = await getSupabaseClient()
    .from('tournaments')
    .select('id, name, start_date, end_date, status')
    .order('start_date', { ascending: false });
  if (error) throw new Error(`Couldn't load tournaments: ${error.message}`);
  return (data ?? []).map((t) => ({ id: t.id, name: t.name, startDate: t.start_date, endDate: t.end_date, status: t.status }));
}

/** One tournament with its games and the team's stats. */
export function fetchTournament(tournamentId: string, client: ApiClient = apiClient): Promise<TournamentDetailResponse> {
  return client.get(`/tournaments/${encodeURIComponent(tournamentId)}`, tournamentDetailResponseSchema);
}

/** The teams the user heads (head coach or athletic director), which they may enter. */
export function fetchTournamentTeamOptions(userId: string): Promise<TournamentTeamOption[]> {
  return getTournamentTeamOptions(getSupabaseClient(), userId);
}

/**
 * Creates the tournament through the permission-checked RPC; resolves to its
 * ids. The RPC's refusal of a team the user doesn't head reads as the web's message.
 */
export async function createTournament(input: CreateTournamentInput) {
  try {
    return await createTournamentRpc(getSupabaseClient(), input);
  } catch (error) {
    const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : '';
    if (message.includes('active head coach or athletic director')) {
      throw new Error('You must be an active head coach or athletic director for the selected team.');
    }
    console.warn('createTournament failed', message);
    throw new Error('Tournament creation failed. Your entries are still here; please try again.');
  }
}

/** The tournament list. */
export function useTournaments() {
  return useQuery({ queryKey: tournamentsQueryKey, queryFn: fetchTournaments });
}

/** One tournament. */
export function useTournament(tournamentId: string) {
  return useQuery({
    queryKey: tournamentQueryKey(tournamentId),
    queryFn: () => fetchTournament(tournamentId),
    enabled: tournamentId.length > 0,
  });
}

/** The teams the signed-in user may enter. */
export function useTournamentTeamOptions(userId: string | undefined) {
  return useQuery({
    queryKey: tournamentTeamOptionsQueryKey(userId ?? ''),
    queryFn: () => fetchTournamentTeamOptions(userId ?? ''),
    enabled: Boolean(userId),
  });
}
