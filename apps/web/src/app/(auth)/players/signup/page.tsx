import type { JSX } from 'react';
import { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { PlayerSignupForm } from '@/components/auth/PlayerSignupForm';

export const metadata: Metadata = {
  title: 'Create your player profile',
  description: 'Build a public recruiting profile with career stats across every team you play for.',
};

export default async function PlayerSignupPage(): Promise<JSX.Element> {
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    redirect('/players/me');
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-brand-700">Your Recruiting Profile</h1>
          <p className="text-gray-500 mt-2">
            Stats that follow you — every team, every season, one shareable link.
          </p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          <PlayerSignupForm />
        </div>
        <p className="text-center text-sm text-gray-500 mt-6">
          Already have an account?{' '}
          <Link href="/login" className="text-brand-700 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
