import type { JSX } from 'react';
import { notFound } from 'next/navigation';
import { ScoringBoard } from '@/app/(app)/games/[gameId]/score/ScoringBoard';
import {
  DEMO_GAME,
  DEMO_LINEUP,
  DEMO_OPPONENT_LINEUP,
  DEMO_INITIAL_EVENTS,
} from '@/lib/demo/scorekeeper';

export const metadata = { title: 'Scorekeeper UI Preview' };

export default function ScorekeeperPreviewPage(): JSX.Element {
  if (process.env.NODE_ENV !== 'development') notFound();

  return (
    <main className="min-h-screen bg-gray-50">
      <ScoringBoard
        game={DEMO_GAME}
        lineup={DEMO_LINEUP}
        opponentLineup={DEMO_OPPONENT_LINEUP}
        initialEvents={DEMO_INITIAL_EVENTS}
        currentUserId="demo"
        isCoach={true}
        isDemo={true}
      />
    </main>
  );
}
