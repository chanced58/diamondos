import type { JSX } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { getLeagueForStaff } from '@baseball/database';
import { LeagueSetupWizard } from './LeagueSetupWizard';

export const metadata = { title: 'League Setup' };

export default async function LeagueSetupPage(): Promise<JSX.Element> {
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) redirect('/dashboard');

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey);

  const league = await getLeagueForStaff(db, user.id);
  if (!league) redirect('/dashboard');
  if (league.setup_completed_at) redirect('/league/admin');

  return (
    <div className="min-h-screen flex items-start justify-center bg-gray-50 py-12 px-4">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Set Up Your League</h1>
          <p className="text-gray-500 mt-2">
            Complete the setup to get your league ready for the season.
          </p>
        </div>
        <LeagueSetupWizard
          leagueId={league.id}
          initialName={league.name}
          initialStateCode={league.state_code ?? ''}
        />
      </div>
    </div>
  );
}
