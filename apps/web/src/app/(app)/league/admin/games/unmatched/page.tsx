import type { JSX } from 'react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { getLeagueForStaff } from '@baseball/database';
import { UnmatchedPlayersPanel } from '@/components/league-games/UnmatchedPlayersPanel';
import { loadRosterOptions } from '@/lib/league-games/placeholder-rosters';
import { listUnmatchedPlaceholders } from '@/lib/services/league-games/placeholders';

export const metadata: Metadata = { title: 'Unknown Players' };

export default async function UnmatchedPlayersPage(): Promise<JSX.Element | null> {
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const league = await getLeagueForStaff(db, user.id);
  if (!league) redirect('/dashboard');

  const result = await listUnmatchedPlaceholders(db, user.id, { leagueId: league.id });
  if (!result.ok) redirect('/dashboard');

  const { placeholders } = result.data;
  const rosters = await loadRosterOptions(db, placeholders.map((placeholder) => placeholder.teamId));

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Unknown players</h1>
        <p className="text-sm text-gray-500">{league.name}: players scorers added on the spot, waiting for a match.</p>
      </div>
      {placeholders.length === 0 ? (
        <p className="text-sm text-gray-500">Every player in your league games has been matched.</p>
      ) : (
        <UnmatchedPlayersPanel placeholders={placeholders} rosters={rosters} showGame />
      )}
    </div>
  );
}
