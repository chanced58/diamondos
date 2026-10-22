import { useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { Badge, EmptyState, ErrorState, ListRow, SegmentedControl } from '@baseball/ui';
import { ALL_SEASONS, type SeasonStatsResponse, type StatTier } from '@baseball/shared';
import { useCan, useRole } from '../../../src/providers/RoleProvider';
import { TeamSwitcher } from '../../../src/features/teams/TeamSwitcher';
import { ListGroup } from '../../../src/features/navigation/ListGroup';
import { StatTable } from '../../../src/features/stats/StatTable';
import { currentTime, useSeasonStats } from '../../../src/features/stats/season-stats-api';
import {
  CATCHER_COLUMNS,
  TIER_OPTIONS,
  catcherSortValue,
  formatRecord,
  nextSort,
  pitcherSortValue,
  seasonBattingColumns,
  seasonBattingTotals,
  seasonPitchingColumns,
  seasonPitchingTotals,
  sortStatRows,
  statValue,
  type SortState,
} from '../../../src/features/stats/season-stats-model';
import { describeApiError } from '../../../src/lib/api-client';

type Section = 'pitching' | 'hitting' | 'catcher' | 'opponents';

const DEFAULT_SORTS: Record<Exclude<Section, 'opponents'>, SortState> = {
  pitching: { key: 'inningsPitchedOuts', ascending: false },
  hitting: { key: 'plateAppearances', ascending: false },
  catcher: { key: 'totalInnings', ascending: false },
};

/**
 * Season stats (the web /compliance Stats page) for the active team: pitching
 * with rest status and 7-day counts, hitting, catcher innings and, on plans
 * with opponent tracking, opponents. Any team member; coaches also reach the
 * Bullpen Planner from here.
 */
export default function StatsScreen() {
  const { activeTeam } = useRole();
  const isCoach = useCan('team.coach');
  const teamId = activeTeam?.teamId;
  const [seasonId, setSeasonId] = useState<string | undefined>(undefined);
  const [section, setSection] = useState<Section>('pitching');
  const [tier, setTier] = useState<StatTier | null>(null);
  const [sorts, setSorts] = useState(DEFAULT_SORTS);
  const query = useSeasonStats(teamId, seasonId);

  if (!teamId) {
    return (
      <View className="flex-1 bg-gray-50">
        <EmptyState title="No team" message="Join a team to see its stats." />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-50">
      <TeamSwitcher />
      {query.isPending ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      ) : !query.data ? (
        <ErrorState message={describeApiError(query.error)} onRetry={() => void query.refetch()} />
      ) : (
        <SeasonStats
          stats={query.data}
          seasonKey={seasonId}
          onSeason={setSeasonId}
          section={shownSection(section, query.data)}
          onSection={setSection}
          tier={tier ?? query.data.defaultTier}
          onTier={setTier}
          sorts={sorts}
          onSort={(key) => {
            // Sort the table on screen, which is Pitching when Opponents isn't on this plan.
            const shown = shownSection(section, query.data);
            if (shown === 'opponents') return;
            setSorts({ ...sorts, [shown]: nextSort(sorts[shown], key) });
          }}
          isCoach={isCoach}
          refreshing={query.isRefetching}
          onRefresh={() => void query.refetch()}
        />
      )}
    </View>
  );
}

/** The tab on screen: Opponents falls back to Pitching on a plan (or team) without opponent tracking. */
function shownSection(section: Section, stats: SeasonStatsResponse): Section {
  return section === 'opponents' && !stats.features.opponents ? 'pitching' : section;
}

interface SeasonStatsProps {
  stats: SeasonStatsResponse;
  /** The season the query asked for, so detail screens reuse its cache. */
  seasonKey: string | undefined;
  onSeason: (seasonId: string) => void;
  section: Section;
  onSection: (section: Section) => void;
  tier: StatTier;
  onTier: (tier: StatTier) => void;
  sorts: typeof DEFAULT_SORTS;
  onSort: (key: string) => void;
  isCoach: boolean;
  refreshing: boolean;
  onRefresh: () => void;
}

function SeasonStats({
  stats,
  seasonKey,
  onSeason,
  section,
  onSection,
  tier,
  onTier,
  sorts,
  onSort,
  isCoach,
  refreshing,
  onRefresh,
}: SeasonStatsProps) {
  const now = currentTime();
  const sectionOptions = [
    { value: 'pitching', label: 'Pitching' },
    { value: 'hitting', label: 'Hitting' },
    { value: 'catcher', label: 'Catcher' },
    ...(stats.features.opponents ? [{ value: 'opponents', label: 'Opponents' }] : []),
  ] as { value: Section; label: string }[];
  const gamesLabel = `${stats.gameCount} ${stats.gameCount === 1 ? 'game' : 'games'}`;
  const detailParams = seasonKey ? { season: seasonKey } : {};

  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {stats.seasons.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} className="mb-2">
          {[{ id: ALL_SEASONS, name: 'All games' }, ...stats.seasons].map((season) => {
            const selected = (stats.season?.id ?? ALL_SEASONS) === season.id;
            return (
              <TouchableOpacity
                key={season.id}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => onSeason(season.id)}
                className={`px-3 py-1.5 rounded-full border ${selected ? 'bg-gray-900 border-gray-900' : 'bg-white border-gray-300'}`}
              >
                <Text className={`text-sm font-semibold ${selected ? 'text-white' : 'text-gray-700'}`}>{season.name}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
      <Text className="text-sm text-gray-500 mb-3">
        {stats.season ? `${stats.season.name} · ${gamesLabel}` : `All games · ${gamesLabel} scored`}
      </Text>

      {stats.missingWaiverCount > 0 && (
        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => router.push('/(tabs)/more/roster')}
          className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3"
        >
          <Text className="text-sm text-amber-900">
            <Text className="font-semibold">{stats.missingWaiverCount}</Text>{' '}
            {stats.missingWaiverCount === 1 ? 'active player is' : 'active players are'} missing a current liability waiver.
          </Text>
          <Text className="text-xs font-semibold text-amber-900 mt-1">Review roster ›</Text>
        </TouchableOpacity>
      )}

      {isCoach && (
        <View className="mb-3">
          <ListGroup>
            <ListRow
              title="Bullpen planner"
              subtitle="Who can pitch on a game day"
              onPress={() => router.push('/(tabs)/stats/bullpen')}
            />
          </ListGroup>
        </View>
      )}

      <View className="gap-2">
        <SegmentedControl options={sectionOptions} value={section} onChange={onSection} testID="stats-section" />
        {(section === 'pitching' || section === 'hitting') && (
          <SegmentedControl options={TIER_OPTIONS} value={tier} onChange={onTier} testID="stats-tier" />
        )}
      </View>

      {section === 'pitching' && (
        <>
          <View className="mt-3 rounded-xl border border-gray-200 overflow-hidden">
            <StatTable
              rows={sortStatRows(stats.pitching, sorts.pitching, (r) => r.playerName, (r, key) => pitcherSortValue(r, key, now))}
              rowKey={(r) => r.playerId}
              rowLabel={(r) => r.playerName}
              columns={seasonPitchingColumns(tier, stats.features.advancedPitching, now)}
              totals={seasonPitchingTotals(stats.pitching, tier, stats.features.advancedPitching)}
              emptyText={stats.season ? `No pitching data for ${stats.season.name} yet.` : 'No pitching data yet.'}
              labelHeader="Pitcher"
              sort={sorts.pitching}
              onSort={onSort}
              onPressRow={(r) =>
                router.push({ pathname: '/(tabs)/stats/pitcher/[playerId]', params: { playerId: r.playerId, ...detailParams } })
              }
            />
          </View>
          {stats.pitching.length > 0 && (
            <Text className="text-xs text-gray-400 mt-2">Tap a pitcher for rest status and average by count.</Text>
          )}
        </>
      )}

      {section === 'hitting' && (
        <View className="mt-3 rounded-xl border border-gray-200 overflow-hidden">
          <StatTable
            rows={sortStatRows(stats.batting, sorts.hitting, (r) => r.playerName, statValue)}
            rowKey={(r) => r.playerId}
            rowLabel={(r) => r.playerName}
            columns={seasonBattingColumns(tier, stats.features.advancedBatting)}
            totals={seasonBattingTotals(stats.batting, tier, stats.features.advancedBatting)}
            emptyText={stats.season ? `No hitting data for ${stats.season.name} yet.` : 'No hitting data yet.'}
            labelHeader="Batter"
            sort={sorts.hitting}
            onSort={onSort}
          />
        </View>
      )}

      {section === 'catcher' && (
        <>
          <View className="mt-3 rounded-xl border border-gray-200 overflow-hidden">
            <StatTable
              rows={sortStatRows(stats.catcher, sorts.catcher, (r) => r.playerName, catcherSortValue)}
              rowKey={(r) => r.playerId}
              rowLabel={(r) => r.playerName}
              columns={CATCHER_COLUMNS}
              emptyText={stats.season ? `No catcher innings tracked for ${stats.season.name} yet.` : 'No catcher innings tracked yet.'}
              labelHeader="Catcher"
              sort={sorts.catcher}
              onSort={onSort}
            />
          </View>
          {stats.catcher.length === 0 && (
            <Text className="text-xs text-gray-400 mt-2">Innings fill in from in-game substitutions.</Text>
          )}
        </>
      )}

      {section === 'opponents' && (
        <View className="mt-3">
          {(stats.opponents ?? []).length === 0 ? (
            <Text className="text-sm text-gray-400 px-1">No opponent stats yet.</Text>
          ) : (
            <ListGroup>
              {(stats.opponents ?? []).map((team) => (
                <ListRow
                  key={team.teamId}
                  title={team.teamName}
                  subtitle={`${team.gamesPlayed} ${team.gamesPlayed === 1 ? 'game' : 'games'}`}
                  right={<Badge label={formatRecord(team)} />}
                  onPress={() =>
                    router.push({
                      pathname: '/(tabs)/stats/opponent/[opponentTeamId]',
                      params: { opponentTeamId: team.teamId, ...detailParams },
                    })
                  }
                />
              ))}
            </ListGroup>
          )}
        </View>
      )}
    </ScrollView>
  );
}
