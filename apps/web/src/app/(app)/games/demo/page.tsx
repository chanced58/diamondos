import type { JSX } from 'react';
import { createServerClient } from '@/lib/supabase/server';
import { ScoringBoard } from '../[gameId]/score/ScoringBoard';

export const metadata = { title: 'Practice Scoring — Demo' };

import { DEMO_GAME, DEMO_LINEUP, DEMO_OPPONENT_LINEUP, DEMO_INITIAL_EVENTS } from '@/lib/demo/scorekeeper';

// ── Page ───────────────────────────────────────────────────────────────────

export default async function DemoScoringPage(): Promise<JSX.Element | null> {
  const auth = createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return null;

  return (
    <ScoringBoard
      game={DEMO_GAME}
      lineup={DEMO_LINEUP}
      opponentLineup={DEMO_OPPONENT_LINEUP}
      initialEvents={DEMO_INITIAL_EVENTS}
      currentUserId={user.id}
      isCoach={true}
      isDemo={true}
    />
  );
}
