import type { JSX } from 'react';
import { Metadata } from 'next';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { BrandingEditor } from './BrandingEditor';

export const metadata: Metadata = { title: 'Branding — Admin' };

export default async function BrandingPage(): Promise<JSX.Element> {
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

  const { data: settings } = await db
    .from('site_settings')
    .select('*')
    .eq('id', 'default')
    .single();

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-8">
        <a href="/admin" className="text-sm text-gray-500 hover:text-gray-700 transition-colors">
          &larr; Back to Admin
        </a>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">Site Branding</h1>
        <p className="text-gray-500 mt-1">
          Customize the logo, colors, and messaging for the public home page and lead capture form.
        </p>
      </div>

      <BrandingEditor initialSettings={settings} />
    </div>
  );
}
