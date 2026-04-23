import type { JSX } from 'react';
import { createServerClient } from '@/lib/supabase/server';
import { getGameById } from '@baseball/database';
import { LiveScoreClient } from '@/components/game/LiveScoreClient';
import { BrandMark } from '@/components/ui/BrandMark';
import { Metadata } from 'next';

interface Props {
  params: { gameId: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const supabase = createServerClient();
  const game = await getGameById(supabase, params.gameId).catch(() => null);
  if (!game) return { title: 'Live Game' };
  return { title: `Live: ${game.opponent_name}` };
}

export default async function LiveGamePage({ params }: Props): Promise<JSX.Element | null> {
  const supabase = createServerClient();
  const game = await getGameById(supabase, params.gameId).catch(() => null);

  if (!game) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--app-bg)' }}>
        <p style={{ color: 'var(--app-fg-muted)' }}>Game not found.</p>
      </div>
    );
  }

  // Look up the team name for display (public data — no auth needed for public viewer).
  const { data: team } = await supabase
    .from('teams')
    .select('name')
    .eq('id', game.team_id)
    .maybeSingle();

  return (
    <div style={{ minHeight: '100vh', background: 'var(--app-bg)' }}>
      <header
        style={{
          padding: '18px 20px',
          borderBottom: '1px solid var(--app-border)',
          background: 'var(--app-surface)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <BrandMark size={28} />
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>DiamondOS</div>
          <div style={{ fontSize: 11, color: 'var(--app-fg-muted)' }}>Live score</div>
        </div>
      </header>
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px 20px 60px' }}>
        <LiveScoreClient gameId={params.gameId} initialGame={game} teamName={team?.name} />
        <p style={{ textAlign: 'center', color: 'var(--app-fg-subtle)', fontSize: 12, marginTop: 32 }}>
          Powered by DiamondOS
        </p>
      </div>
    </div>
  );
}
