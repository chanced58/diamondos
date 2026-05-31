import type { JSX } from 'react';
import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { getActiveTeam } from '@/lib/active-team';
import { getActiveLeague } from '@/lib/active-league';
import { getLeagueAccess } from '@/lib/league-access';
import { getLeagueTeamsAll, getLeagueDivisions, getLeagueStaff, getLeagueForStaff } from '@baseball/database';
import { LeagueAdminClient } from './LeagueAdminClient';
import { HomePageSettingsForm } from './HomePageSettingsForm';

export const metadata: Metadata = { title: 'League Admin' };

export default async function LeagueAdminPage(): Promise<JSX.Element | null> {
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Resolve league: try via active team first, fall back to staff membership
  const activeTeam = await getActiveTeam(supabase, user.id);
  let league = activeTeam ? await getActiveLeague(activeTeam.id) : null;

  if (!league) {
    // Standalone league admin (no team) — resolve via staff membership
    const staffLeague = await getLeagueForStaff(db, user.id);
    if (staffLeague) {
      league = {
        id: staffLeague.id,
        name: staffLeague.name,
        description: staffLeague.description,
        logo_url: staffLeague.logo_url,
        state_code: staffLeague.state_code,
        setup_completed_at: staffLeague.setup_completed_at,
      };
    }
  }

  if (!league) redirect('/dashboard');

  const access = await getLeagueAccess(league.id, user.id);
  if (!access.isLeagueStaff) redirect('/dashboard');

  // Guard: redirect to setup wizard if league setup is not complete
  if (!league.setup_completed_at) redirect('/league/setup');

  const [teams, divisions, staff] = await Promise.all([
    getLeagueTeamsAll(db, league.id),
    getLeagueDivisions(db, league.id),
    getLeagueStaff(db, league.id),
  ]);

  // Fetch all opponent teams on the platform so any can be added to the league
  const { data: availableOpponentTeams } = await db
    .from('opponent_teams')
    .select('id, name, city')
    .order('name');

  // Fetch the league's scoring settings JSON (validated/merged client-side).
  // We must distinguish "row exists with empty object" (which is the v1 default
  // for any league that hasn't opened the Settings panel yet) from "the query
  // failed". The latter is fatal — we throw rather than render the form seeded
  // with defaults, because the user might then click Save and overwrite real
  // league settings with the platform defaults.
  const { data: scoringRow, error: scoringErr } = await db
    .from('leagues')
    .select('scoring_settings, slug, visibility, home_theme, leader_config')
    .eq('id', league.id)
    .maybeSingle();
  if (scoringErr) {
    console.error(
      `[league-admin] failed to load scoring_settings for league=${league.id}: ${scoringErr.message}`,
    );
    throw new Error('Failed to load league settings. Refresh to try again.');
  }
  const scoringSettings = scoringRow?.scoring_settings ?? {};

  // System pitch-count rule presets (NFHS / Little League / NCAA). League
  // admins can pick one as the default for new seasons in this league.
  const { data: systemPitchRules, error: pitchRulesErr } = await db
    .from('pitch_compliance_rules')
    .select('id, rule_name, age_min, age_max')
    .is('team_id', null)
    .eq('is_active', true)
    .order('rule_name');
  if (pitchRulesErr) {
    console.error(
      `[league-admin] failed to load pitch_compliance_rules for league=${league.id}: ${pitchRulesErr.message}`,
    );
  }
  const pitchRuleOptions = (systemPitchRules ?? []).map((r) => ({
    id: r.id,
    label: r.age_min != null && r.age_max != null
      ? `${r.rule_name} (ages ${r.age_min}–${r.age_max})`
      : r.rule_name,
  }));

  return (
    <div className="p-8 max-w-4xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Manage League</h1>
      <p className="text-gray-500 mb-6">{league.name}</p>

      <LeagueAdminClient
        leagueId={league.id}
        teams={teams.map((t) => ({
          id: t.id,
          teamId: t.team_id ?? t.opponent_team_id ?? '',
          teamName: t.teams?.name ?? t.opponent_teams?.name ?? 'Unknown',
          organization: t.teams?.organization ?? null,
          divisionId: t.division_id,
          isOpponentTeam: t.opponent_team_id !== null,
          isActive: t.is_active,
        }))}
        divisions={divisions}
        staff={staff.map((s) => {
          const profile = Array.isArray(s.user_profiles) ? s.user_profiles[0] : s.user_profiles;
          return {
            id: s.id,
            userId: s.user_id,
            role: s.role,
            name: profile
              ? `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim() || profile.email || 'Unknown'
              : 'Unknown',
          };
        })}
        isAdmin={access.isLeagueAdmin}
        scoringSettings={scoringSettings}
        pitchRuleOptions={pitchRuleOptions}
        availableOpponentTeams={(availableOpponentTeams ?? []).map((t) => ({
          id: t.id,
          name: t.name,
          city: t.city,
        }))}
      />

      <section className="mt-10 border-t border-slate-200 pt-8">
        <h2 className="text-xl font-bold text-gray-900">Home Page</h2>
        {scoringRow?.slug ? (
          <p className="mb-4 text-sm text-slate-500">
            Public address:{' '}
            <a className="underline" href={`/l/${scoringRow.slug}`}>
              /l/{scoringRow.slug}
            </a>
          </p>
        ) : null}
        <HomePageSettingsForm
          leagueId={league.id}
          canEdit={access.isLeagueAdmin}
          initialVisibility={(scoringRow?.visibility ?? 'public') as 'public' | 'signed_in'}
          initialSlug={scoringRow?.slug ?? ''}
          initialTheme={scoringRow?.home_theme}
          initialLeaderConfig={scoringRow?.leader_config}
        />
      </section>
    </div>
  );
}
