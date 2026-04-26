import type { JSX } from 'react';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import type { Metadata } from 'next';
import { createServerClient } from '@/lib/supabase/server';
import { LiveScoreClient } from '@/components/game/LiveScoreClient';
import { canViewLiveGame } from '@/lib/live/viewer-access';
import { buildLivePlayerNameMap } from '@/lib/live/player-name-map';
import type { Database } from '@baseball/database';

type GameRow = Database['public']['Tables']['games']['Row'];
type EventRow = Database['public']['Tables']['game_events']['Row'];

interface Props {
  params: { gameId: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return { title: 'Live Game' };
  const db = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey);
  const { data: game } = await db
    .from('games')
    .select('opponent_name')
    .eq('id', params.gameId)
    .maybeSingle();
  if (!game) return { title: 'Live Game' };
  return { title: `Live: ${game.opponent_name ?? 'TBD'}` };
}

export default async function LiveGamePage({ params }: Props): Promise<JSX.Element | null> {
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const allowed = await canViewLiveGame(params.gameId, user.id);
  if (!allowed) notFound();

  // Use the service-role client for fetches: viewers may not be team_members
  // (they could be linked parents or opposing-team coaches), so RLS would
  // otherwise hide rows from cross-team viewers. Authorization has already
  // been confirmed above.
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) notFound();
  const db = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey);

  const { data: game } = await db
    .from('games')
    .select('*')
    .eq('id', params.gameId)
    .maybeSingle<GameRow>();
  if (!game) notFound();

  const [{ data: events }, { data: team }] = await Promise.all([
    db.from('game_events').select('*').eq('game_id', game.id).order('sequence_number'),
    db.from('teams').select('name').eq('id', game.team_id).maybeSingle(),
  ]);

  const opponentTeamIds = game.opponent_team_id ? [game.opponent_team_id] : [];
  const playerNameMap = await buildLivePlayerNameMap(db, [game.team_id], opponentTeamIds);

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px 20px 60px' }}>
      <LiveScoreClient
        gameId={params.gameId}
        initialGame={game}
        initialEvents={(events ?? []) as EventRow[]}
        teamName={team?.name}
        playerNameMap={playerNameMap}
      />
    </div>
  );
}
