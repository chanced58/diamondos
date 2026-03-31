import type { JSX } from 'react';
import { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { CreateLeagueForm } from '@/components/admin/CreateLeagueForm';

export const metadata: Metadata = { title: 'Create League — Platform Admin' };

export default async function CreateLeaguePage(): Promise<JSX.Element> {
  const auth = createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) redirect('/login');

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: profile } = await db
    .from('user_profiles')
    .select('is_platform_admin')
    .eq('id', user.id)
    .single();

  if (!profile?.is_platform_admin) redirect('/admin');

  return (
    <div className="p-8 max-w-lg">
      <div className="flex items-center gap-3 mb-1">
        <Link href="/admin/leagues" className="text-sm text-brand-700 hover:underline">
          &larr; All Leagues
        </Link>
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mt-3 mb-2">Create a league</h1>
      <p className="text-gray-500 mb-8">Set up a new league to organize teams and competitions.</p>
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <CreateLeagueForm />
      </div>
    </div>
  );
}
