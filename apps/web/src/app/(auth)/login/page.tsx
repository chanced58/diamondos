import type { JSX } from 'react';
import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { LoginForm } from '@/components/auth/LoginForm';

export const metadata: Metadata = { title: 'Sign In' };

const ERROR_MESSAGES: Record<string, string> = {
  auth_failed:
    'Your sign-in link has expired or was already used. Please request a new one.',
  link_wrong_browser:
    'It looks like you opened the sign-in link in a different browser or app. Please request a new link below.',
  session_expired: 'Your session has expired. Please sign in again.',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; redirectTo?: string }>;
}): Promise<JSX.Element> {
  const params = await searchParams;

  // Redirect already-authenticated users to dashboard (prevents login loop)
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    redirect('/dashboard');
  }

  const errorMessage = params.error
    ? ERROR_MESSAGES[params.error] ?? 'An authentication error occurred. Please try again.'
    : null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-brand-700">Baseball Coaches</h1>
          <p className="text-gray-500 mt-2">Sign in to your coaching dashboard</p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          {errorMessage && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-6">
              <p className="text-sm text-red-700">{errorMessage}</p>
            </div>
          )}
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
