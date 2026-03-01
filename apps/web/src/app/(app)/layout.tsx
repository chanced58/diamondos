import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { getTeamsForUser } from '@baseball/database';
import { Sidebar } from '@/components/layout/Sidebar';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const teams = await getTeamsForUser(supabase, user.id);
  const activeTeam = teams?.[0]?.teams as { name: string; organization: string | null } | undefined;

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar teamName={activeTeam?.name} teamOrg={activeTeam?.organization ?? undefined} />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
