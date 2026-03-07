import { createServerClient } from '@/lib/supabase/server';
import { ScoringBoard } from '../[gameId]/score/ScoringBoard';

export const metadata = { title: 'Practice Scoring — Demo' };

// ── Static demo data ───────────────────────────────────────────────────────

const DEMO_GAME = {
  id: 'demo-game',
  opponentName: 'Demo Opponent',
  locationType: 'home',
  teamId: 'demo-team',
};

const DEMO_LINEUP = [
  { playerId: 'demo-1', battingOrder: 1, startingPosition: 'P',  player: { id: 'demo-1', firstName: 'Alex',   lastName: 'Rivera',   jerseyNumber: 12 } },
  { playerId: 'demo-2', battingOrder: 2, startingPosition: 'SS', player: { id: 'demo-2', firstName: 'Marcus', lastName: 'Chen',     jerseyNumber: 4  } },
  { playerId: 'demo-3', battingOrder: 3, startingPosition: 'CF', player: { id: 'demo-3', firstName: 'Jordan', lastName: 'Williams', jerseyNumber: 23 } },
  { playerId: 'demo-4', battingOrder: 4, startingPosition: '1B', player: { id: 'demo-4', firstName: 'Tyler',  lastName: 'Johnson',  jerseyNumber: 35 } },
  { playerId: 'demo-5', battingOrder: 5, startingPosition: 'LF', player: { id: 'demo-5', firstName: 'Sam',    lastName: 'Davis',    jerseyNumber: 7  } },
  { playerId: 'demo-6', battingOrder: 6, startingPosition: 'C',  player: { id: 'demo-6', firstName: 'Chris',  lastName: 'Martinez', jerseyNumber: 18 } },
  { playerId: 'demo-7', battingOrder: 7, startingPosition: '3B', player: { id: 'demo-7', firstName: 'Devon',  lastName: 'Thompson', jerseyNumber: 9  } },
  { playerId: 'demo-8', battingOrder: 8, startingPosition: 'RF', player: { id: 'demo-8', firstName: 'Riley',  lastName: 'Garcia',   jerseyNumber: 14 } },
  { playerId: 'demo-9', battingOrder: 9, startingPosition: '2B', player: { id: 'demo-9', firstName: 'Drew',   lastName: 'Wilson',   jerseyNumber: 21 } },
];

const DEMO_OPPONENT_LINEUP = [
  { playerId: 'opp-1', battingOrder: 1, startingPosition: 'CF', player: { id: 'opp-1', firstName: 'Batter',  lastName: '1', jerseyNumber: 1  } },
  { playerId: 'opp-2', battingOrder: 2, startingPosition: 'SS', player: { id: 'opp-2', firstName: 'Batter',  lastName: '2', jerseyNumber: 2  } },
  { playerId: 'opp-3', battingOrder: 3, startingPosition: '1B', player: { id: 'opp-3', firstName: 'Batter',  lastName: '3', jerseyNumber: 3  } },
  { playerId: 'opp-4', battingOrder: 4, startingPosition: '3B', player: { id: 'opp-4', firstName: 'Batter',  lastName: '4', jerseyNumber: 4  } },
  { playerId: 'opp-5', battingOrder: 5, startingPosition: 'LF', player: { id: 'opp-5', firstName: 'Batter',  lastName: '5', jerseyNumber: 5  } },
  { playerId: 'opp-6', battingOrder: 6, startingPosition: 'RF', player: { id: 'opp-6', firstName: 'Batter',  lastName: '6', jerseyNumber: 6  } },
  { playerId: 'opp-7', battingOrder: 7, startingPosition: 'C',  player: { id: 'opp-7', firstName: 'Batter',  lastName: '7', jerseyNumber: 7  } },
  { playerId: 'opp-8', battingOrder: 8, startingPosition: '2B', player: { id: 'opp-8', firstName: 'Batter',  lastName: '8', jerseyNumber: 8  } },
  { playerId: 'opp-9', battingOrder: 9, startingPosition: 'P',  player: { id: 'opp-9', firstName: 'Batter',  lastName: '9', jerseyNumber: 9  } },
];

// A single game_start event seeds the pitcher and inning state
const DEMO_INITIAL_EVENTS = [
  {
    id: 'demo-event-start',
    game_id: 'demo-game',
    sequence_number: 1,
    event_type: 'game_start',
    inning: 1,
    is_top_of_inning: true,
    payload: { homeLineupPitcherId: 'demo-1' },
    occurred_at: new Date().toISOString(),
    created_by: 'demo',
    device_id: 'web',
  },
];

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
