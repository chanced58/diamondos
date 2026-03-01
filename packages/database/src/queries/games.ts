import type { TypedSupabaseClient } from '../client';

export async function getGameById(client: TypedSupabaseClient, gameId: string) {
  const { data, error } = await client
    .from('games')
    .select('*')
    .eq('id', gameId)
    .single();
  if (error) throw error;
  return data;
}
