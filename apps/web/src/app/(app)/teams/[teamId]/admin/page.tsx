import { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Team Admin' };

export default async function TeamAdminPage({
  params,
}: {
  params: { teamId: string };
}) {
  const auth = createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) redirect('/login');

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const [membershipResult, teamResult] = await Promise.all([
    db
      .from('team_members')
      .select('role')
      .eq('team_id', params.teamId)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle(),
    db.from('teams').select('name').eq('id', params.teamId).single(),
  ]);

  const role = membershipResult.data?.role;
  if (role !== 'head_coach' && role !== 'athletic_director') {
    redirect(`/teams/${params.teamId}/roster`);
  }

  const teamName = teamResult.data?.name ?? 'Your Team';

  const cards = [
    {
      href: `/teams/${params.teamId}/admin/users`,
      title: 'Users & Invitations',
      description: 'Manage players, staff, and pending invitations.',
      icon: '👥',
    },
    {
      href: `/teams/${params.teamId}/roster/new`,
      title: 'Add Player',
      description: 'Add a new player to the roster.',
      icon: '⚾',
    },
    {
      href: `/teams/${params.teamId}/roster/staff/new`,
      title: 'Invite Staff',
      description: 'Invite a coach, scorekeeper, or staff member.',
      icon: '📋',
    },
    {
      href: `/teams/${params.teamId}/roster`,
      title: 'Roster',
      description: 'View and manage the full team roster.',
      icon: '📑',
    },
  ];

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Team Admin</h1>
      <p className="text-gray-500 mb-8">{teamName}</p>

      <div className="grid grid-cols-2 gap-4">
        {cards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="bg-white border border-gray-200 rounded-xl p-5 hover:border-brand-300 hover:shadow-sm transition-all group"
          >
            <div className="text-2xl mb-2">{card.icon}</div>
            <h2 className="font-semibold text-gray-900 group-hover:text-brand-700 transition-colors">
              {card.title}
            </h2>
            <p className="text-sm text-gray-500 mt-1">{card.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
