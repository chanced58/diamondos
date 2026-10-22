import type { JSX } from 'react';
import { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { getActiveTeam } from '@/lib/active-team';
import type { PitchingStats, BattingStats, StatTier } from '@baseball/shared';
import { loadTeamSeasonStats } from '@/lib/stats/load-season-stats';
import { PitchingStatsTable } from './PitchingStatsTable';
import { BattingStatsTable } from './BattingStatsTable';
import { OpponentsStatsTable } from './OpponentsStatsTable';
import { CatcherInningsTable } from './CatcherInningsTable';
import type { OpponentTeamStats } from './OpponentsStatsTable';
import { SeasonPicker } from './SeasonPicker';
import { TierToggle } from './TierToggle';
import { getActiveLeague } from '@/lib/active-league';
import { getTeamTier } from '@/lib/team-tier';
import { hasFeature, Feature } from '@baseball/shared';

export const metadata: Metadata = { title: 'Stats' };

export default async function CompliancePage({
  searchParams,
}: {
  searchParams: { tab?: string; season?: string; tier?: string };
}): Promise<JSX.Element | null> {
  const VALID_TABS = ['pitching', 'hitting', 'catcher', 'opponents'] as const;
  let tab = VALID_TABS.includes(searchParams.tab as typeof VALID_TABS[number])
    ? (searchParams.tab as typeof VALID_TABS[number])
    : 'pitching';

  const auth = createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) redirect('/login');

  const activeTeam = await getActiveTeam(auth, user.id);
  if (!activeTeam) redirect('/dashboard');

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const [league, subscriptionTier] = await Promise.all([
    getActiveLeague(activeTeam.id),
    getTeamTier(activeTeam.id),
  ]);

  const canViewOpponents = hasFeature(subscriptionTier, Feature.OPPONENT_TRACKING);
  // Gate opponents tab to Pro tier
  if (tab === 'opponents' && !canViewOpponents) tab = 'pitching';

  const stats = await loadTeamSeasonStats(db, activeTeam.id, {
    seasonId: searchParams.season,
    includeCatcher: tab === 'catcher',
    includeOpponents: tab === 'opponents',
  });
  const { seasons: allSeasons, season, complianceMap, missingWaiverCount } = stats;
  const allPitchingStats: PitchingStats[] = stats.pitching;
  const allBattingStats: BattingStats[] = stats.batting;
  const catcherRows = stats.catcher;
  const opponentTeamStats: OpponentTeamStats[] = stats.opponents;
  const gameCount = stats.gameCount;
  const today = new Date().toISOString().slice(0, 10);

  const VALID_TIERS: StatTier[] = ['youth', 'high_school', 'college'];
  const tier: StatTier = VALID_TIERS.includes(searchParams.tier as StatTier)
    ? (searchParams.tier as StatTier)
    : stats.defaultTier;

  return (
    <div className="p-8">
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">Stats</h1>
          <SeasonPicker
            seasons={allSeasons.map((s) => ({ id: s.id, name: s.name }))}
            currentSeasonId={season?.id ?? null}
          />
          {league && canViewOpponents && (
            <Link
              href="/compliance/league"
              className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg hover:bg-amber-100 transition-colors"
            >
              League Stats
            </Link>
          )}
        </div>
        <div className="flex items-center gap-3 mt-2">
          <p className="text-gray-500 text-sm">
            {season
              ? `Season: ${season.name} · ${gameCount} ${gameCount === 1 ? 'game' : 'games'}`
              : `All games · ${gameCount} ${gameCount === 1 ? 'game' : 'games'} scored`}
          </p>
          <TierToggle currentTier={tier} />
        </div>
      </div>

      {/* Tier 8 F5: Missing-waiver banner */}
      {missingWaiverCount > 0 && (
        <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-amber-700">⚠️</span>
            <span className="text-sm text-amber-900">
              <strong>{missingWaiverCount}</strong>{' '}
              {missingWaiverCount === 1 ? 'active player is' : 'active players are'} missing a current liability waiver.
            </span>
          </div>
          <Link
            href={`/teams/${activeTeam.id}/roster`}
            className="text-xs font-medium text-amber-900 bg-white border border-amber-300 px-3 py-1.5 rounded-lg hover:bg-amber-100"
          >
            Review roster →
          </Link>
        </div>
      )}

      {/* Tab strip */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1 w-fit">
        <Link
          href={`/compliance?tab=pitching${season ? `&season=${season.id}` : ''}&tier=${tier}`}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            tab === 'pitching'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Pitching
        </Link>
        <Link
          href={`/compliance?tab=hitting${season ? `&season=${season.id}` : ''}&tier=${tier}`}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            tab === 'hitting'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Hitting
        </Link>
        <Link
          href={`/compliance?tab=catcher${season ? `&season=${season.id}` : ''}&tier=${tier}`}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            tab === 'catcher'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Catcher
        </Link>
        {canViewOpponents && (
          <Link
            href={`/compliance?tab=opponents${season ? `&season=${season.id}` : ''}&tier=${tier}`}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === 'opponents'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Opponents
          </Link>
        )}
      </div>

      {/* Pitching tab */}
      {tab === 'pitching' && (
        allPitchingStats.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl px-5 py-12 text-center">
            <p className="text-gray-500 text-sm">
              {season ? `No pitching data for ${season.name} yet.` : 'No pitching data yet.'}
            </p>
            <p className="text-gray-400 text-xs mt-1">
              Stats will appear once games have been scored.
            </p>
          </div>
        ) : (
          <PitchingStatsTable
            stats={allPitchingStats}
            complianceMap={complianceMap}
            today={today}
            tier={tier}
            subscriptionTier={subscriptionTier}
          />
        )
      )}

      {/* Hitting tab */}
      {tab === 'hitting' && (
        allBattingStats.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl px-5 py-12 text-center">
            <p className="text-gray-500 text-sm">
              {season ? `No hitting data for ${season.name} yet.` : 'No hitting data yet.'}
            </p>
            <p className="text-gray-400 text-xs mt-1">
              Stats will appear once games have been scored.
            </p>
          </div>
        ) : (
          <BattingStatsTable stats={allBattingStats} tier={tier} subscriptionTier={subscriptionTier} />
        )
      )}

      {/* Catcher tab */}
      {tab === 'catcher' && (
        catcherRows.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl px-5 py-12 text-center">
            <p className="text-gray-500 text-sm">
              {season ? `No catcher innings tracked for ${season.name} yet.` : 'No catcher innings tracked yet.'}
            </p>
            <p className="text-gray-400 text-xs mt-1">
              Innings populate from in-game substitutions. Use the &quot;Recompute&quot; action on a game to backfill.
            </p>
          </div>
        ) : (
          <CatcherInningsTable rows={catcherRows} />
        )
      )}

      {/* Opponents tab */}
      {tab === 'opponents' && (
        <OpponentsStatsTable teams={opponentTeamStats} />
      )}
    </div>
  );
}
