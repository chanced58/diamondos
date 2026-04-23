import type { JSX } from 'react';
import { Metadata } from 'next';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { getActiveTeam } from '@/lib/active-team';
import { getUserAccess } from '@/lib/user-access';
import { weAreHome } from '@baseball/shared';
import { CalendarView, CalendarEvent } from './CalendarView';
import { getActiveLeague } from '@/lib/active-league';
import { getLeagueTeamIds } from '@baseball/database';

export const metadata: Metadata = { title: 'Schedule' };

function parseMonth(raw: string | undefined): { year: number; month: number } {
  if (raw && /^\d{4}-\d{2}$/.test(raw)) {
    const [y, m] = raw.split('-').map(Number);
    if (y >= 2000 && m >= 1 && m <= 12) return { year: y, month: m };
  }
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

function toTimeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function toDateKey(iso: string) {
  const d = new Date(iso);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: { month?: string; view?: string };
}): Promise<JSX.Element | null> {
  const auth = createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return null;

  const activeTeam = await getActiveTeam(auth, user.id);

  const { year, month } = parseMonth(searchParams.month);

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Check league membership and resolve view mode
  const league = activeTeam ? await getActiveLeague(activeTeam.id) : null;
  const isLeagueView = searchParams.view === 'league' && league !== null;

  let isCoach = false;
  const events: CalendarEvent[] = [];

  if (activeTeam) {
    // For league view, scope to all league teams; otherwise just active team
    let scopeTeamIds: string[] = [activeTeam.id];
    const teamNameMap: Record<string, string> = {};
    if (isLeagueView && league) {
      const leagueTeamIds = await getLeagueTeamIds(db, league.id);
      if (leagueTeamIds.length > 0) {
        scopeTeamIds = leagueTeamIds;
        const { data: teamsData } = await db
          .from('teams')
          .select('id, name')
          .in('id', scopeTeamIds);
        for (const t of teamsData ?? []) {
          teamNameMap[t.id] = t.name;
        }
      }
    }

    const rangeStart = new Date(year, month - 1, 1).toISOString();
    const rangeEnd   = new Date(year, month, 1).toISOString();

    const [gamesResult, practicesResult, teamEventsResult] = await Promise.all([
      db
        .from('games')
        .select('id, team_id, opponent_name, scheduled_at, location_type, neutral_home_team, status')
        .in('team_id', scopeTeamIds)
        .neq('status', 'cancelled')
        .gte('scheduled_at', rangeStart)
        .lt('scheduled_at', rangeEnd)
        .order('scheduled_at'),
      db
        .from('practices')
        .select('id, scheduled_at, location, status')
        .eq('team_id', activeTeam.id)
        .neq('status', 'cancelled')
        .gte('scheduled_at', rangeStart)
        .lt('scheduled_at', rangeEnd)
        .order('scheduled_at'),
      db
        .from('team_events')
        .select('id, title, event_type, starts_at, location')
        .eq('team_id', activeTeam.id)
        .gte('starts_at', rangeStart)
        .lt('starts_at', rangeEnd)
        .order('starts_at'),
    ]);

    const access = await getUserAccess(activeTeam.id, user.id);
    isCoach = access.isCoach;

    for (const g of gamesResult.data ?? []) {
      const loc = weAreHome(g.location_type, g.neutral_home_team) ? 'vs' : '@';
      const teamLabel = isLeagueView && g.team_id !== activeTeam.id ? teamNameMap[g.team_id] : null;
      events.push({
        id:      g.id,
        type:    'game',
        title:   teamLabel ? `${teamLabel}: ${loc} ${g.opponent_name}` : `${loc} ${g.opponent_name}`,
        dateKey: toDateKey(g.scheduled_at),
        time:    toTimeLabel(g.scheduled_at),
        url:     `/games/${g.id}`,
        detail:  g.status !== 'scheduled' ? g.status.replace('_', ' ') : undefined,
      });
    }

    for (const p of practicesResult.data ?? []) {
      events.push({
        id:      p.id,
        type:    'practice',
        title:   'Practice',
        dateKey: toDateKey(p.scheduled_at),
        time:    toTimeLabel(p.scheduled_at),
        url:     `/practices/${p.id}`,
        detail:  p.location ?? undefined,
      });
    }

    for (const e of teamEventsResult.data ?? []) {
      events.push({
        id:      e.id,
        type:    'event',
        title:   e.title,
        dateKey: toDateKey(e.starts_at),
        time:    toTimeLabel(e.starts_at),
        url:     `/games/events/${e.id}`,
        detail:  e.location ?? undefined,
      });
    }
  }

  return (
    <div className="page" style={{ maxWidth: 1100 }}>
      <div className="between" style={{ marginBottom: 20, alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div className="eyebrow">
            {activeTeam ? (isLeagueView ? league!.name : activeTeam.name) : 'Games'}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 4 }}>
            <h1 className="display" style={{ fontSize: 34 }}>Schedule</h1>
            {league && activeTeam && (
              <div className="seg" style={{ width: 200 }}>
                <Link
                  href={`/games?month=${year}-${String(month).padStart(2, '0')}`}
                  className={!isLeagueView ? 'on' : ''}
                >
                  My Team
                </Link>
                <Link
                  href={`/games?month=${year}-${String(month).padStart(2, '0')}&view=league`}
                  className={isLeagueView ? 'on' : ''}
                >
                  {league.name}
                </Link>
              </div>
            )}
          </div>
        </div>
        {isCoach && activeTeam && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Link href="/games/new" className="btn btn-turf btn-sm">+ Game</Link>
            <Link href="/practices/new" className="btn btn-ghost btn-sm">+ Practice</Link>
            <Link href="/games/events/new" className="btn btn-ghost btn-sm">+ Event</Link>
            <Link href="/games/opponents" style={{ fontSize: 12, color: 'var(--app-brand-2)', padding: '0 6px', textDecoration: 'none', fontWeight: 600 }}>
              Opponents
            </Link>
            <Link href="/games/demo/lineup" style={{ fontSize: 12, color: 'var(--app-brand-2)', padding: '0 6px', textDecoration: 'none', fontWeight: 600 }}>
              Practice scoring
            </Link>
          </div>
        )}
      </div>

      {!activeTeam ? (
        <div className="card" style={{ padding: 24 }}>
          <p style={{ color: 'var(--app-fg-muted)' }}>
            No team found.{' '}
            <Link href="/admin/create-team" style={{ color: 'var(--app-brand-2)', fontWeight: 600 }}>
              Create a team
            </Link>{' '}
            to start scheduling.
          </p>
        </div>
      ) : (
        <CalendarView
          year={year}
          month={month}
          events={events}
          isCoach={isCoach}
          teamId={activeTeam.id}
        />
      )}
    </div>
  );
}
