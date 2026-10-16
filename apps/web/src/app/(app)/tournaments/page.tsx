import type { JSX } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Tournaments — DiamondOS' };

export default async function TournamentsPage(): Promise<JSX.Element> {
  const client = createServerClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) redirect('/login');

  const { data: tournaments, error } = await client.from('tournaments')
    .select('id, name, start_date, end_date, status')
    .order('start_date', { ascending: false });
  if (error) throw error;

  return (
    <main className="mx-auto max-w-5xl p-8">
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-brand-700">Tournament mode</p>
          <h1 className="mt-1 text-3xl font-bold text-gray-950">Tournaments</h1>
          <p className="mt-2 text-gray-600">Create a tournament workspace and manage its games.</p>
        </div>
        <Link href="/tournaments/new" className="rounded-lg bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-800">
          New Tournament
        </Link>
      </div>

      {!tournaments?.length ? (
        <section className="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center">
          <h2 className="text-lg font-semibold text-gray-900">No tournaments yet</h2>
          <p className="mt-2 text-sm text-gray-600">
            Enter a team you coach or create a separate tournament team with its own roster, schedule and stats.
          </p>
        </section>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {tournaments.map((tournament) => (
            <li key={tournament.id}>
              <Link href={`/tournaments/${tournament.id}`} className="block rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition hover:border-brand-300 hover:shadow">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-semibold text-gray-950">{tournament.name}</h2>
                  <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium capitalize text-gray-600">{tournament.status}</span>
                </div>
                <p className="mt-3 text-sm text-gray-600">{tournament.start_date} – {tournament.end_date}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
