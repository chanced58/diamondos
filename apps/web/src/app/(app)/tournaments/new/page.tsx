import type { JSX } from 'react';
import type { Metadata } from 'next';
import { randomUUID } from 'crypto';
import { redirect } from 'next/navigation';
import { getTournamentTeamOptions } from '@baseball/database';
import { createServerClient } from '@/lib/supabase/server';
import { CreateTournamentForm } from './CreateTournamentForm';

export const metadata: Metadata = { title: 'New Tournament — DiamondOS' };

export default async function NewTournamentPage(): Promise<JSX.Element> {
  const client = createServerClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) redirect('/login');

  const [{ data: profile, error: profileError }, teams] = await Promise.all([
    client.from('user_profiles').select('tournament_mode_enabled').eq('id', user.id).maybeSingle(),
    getTournamentTeamOptions(client, user.id),
  ]);
  if (profileError) throw profileError;
  if (!profile?.tournament_mode_enabled) redirect('/tournaments');

  return (
    <main className="mx-auto max-w-3xl p-8">
      <div className="mb-7">
        <p className="text-sm font-medium text-brand-700">Tournament setup</p>
        <h1 className="mt-1 text-3xl font-bold text-gray-950">New Tournament</h1>
        <p className="mt-2 text-gray-600">Choose the team and lineup rules that will apply to tournament games.</p>
      </div>
      <CreateTournamentForm teams={teams} requestId={randomUUID()} />
    </main>
  );
}
