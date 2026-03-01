import { createServerClient } from '@/lib/supabase/server';
import { DemoLineupBuilder } from './DemoLineupBuilder';

export const metadata = { title: 'Practice Mode — Set Lineup' };

const DEMO_PLAYERS = [
  { id: 'demo-1', firstName: 'Alex',   lastName: 'Rivera',   jerseyNumber: 12, primaryPosition: 'P'  },
  { id: 'demo-2', firstName: 'Marcus', lastName: 'Chen',     jerseyNumber: 4,  primaryPosition: 'SS' },
  { id: 'demo-3', firstName: 'Jordan', lastName: 'Williams', jerseyNumber: 23, primaryPosition: 'CF' },
  { id: 'demo-4', firstName: 'Tyler',  lastName: 'Johnson',  jerseyNumber: 35, primaryPosition: '1B' },
  { id: 'demo-5', firstName: 'Sam',    lastName: 'Davis',    jerseyNumber: 7,  primaryPosition: 'LF' },
  { id: 'demo-6', firstName: 'Chris',  lastName: 'Martinez', jerseyNumber: 18, primaryPosition: 'C'  },
  { id: 'demo-7', firstName: 'Devon',  lastName: 'Thompson', jerseyNumber: 9,  primaryPosition: '3B' },
  { id: 'demo-8', firstName: 'Riley',  lastName: 'Garcia',   jerseyNumber: 14, primaryPosition: 'RF' },
  { id: 'demo-9', firstName: 'Drew',   lastName: 'Wilson',   jerseyNumber: 21, primaryPosition: '2B' },
];

export default async function DemoLineupPage() {
  const auth = createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return null;

  return <DemoLineupBuilder players={DEMO_PLAYERS} />;
}
