import { useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { EmptyState, ErrorState, SegmentedControl } from '@baseball/ui';
import type { DashboardView } from '@baseball/shared';
import { useSyncContext } from '../../../src/providers/SyncProvider';
import { useRole } from '../../../src/providers/RoleProvider';
import { TeamSwitcher } from '../../../src/features/teams/TeamSwitcher';
import { ResumeScoringCards } from '../../../src/features/home/ResumeScoringCards';
import { useDashboard } from '../../../src/features/home/dashboard-api';
import { recordTiles, remoteLiveGames } from '../../../src/features/home/dashboard-format';
import {
  AnnouncementList,
  CardAction,
  DashboardCard,
  LiveGameRow,
  NextUpCard,
  RecentGamesList,
  StatTile,
  UpcomingList,
} from '../../../src/features/home/DashboardSections';
import { describeApiError } from '../../../src/lib/api-client';

/**
 * Home (the web dashboard): live games, the next game, the recent record and
 * run differential, the next four weeks, announcements and recent results,
 * with the web's My Team / league switch for a team in a league. A scorer's
 * own live games resume from local data, so that card works offline; the rest
 * is online and refreshes on pull (and every 30 s while a game is live).
 */
export default function HomeScreen() {
  const { isSyncing } = useSyncContext();
  const { activeTeam, loading: roleLoading } = useRole();
  const [view, setView] = useState<DashboardView>('team');
  const query = useDashboard(activeTeam?.teamId, view);

  if (!activeTeam) {
    return (
      <View className="flex-1 bg-gray-50">
        {roleLoading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator />
          </View>
        ) : (
          <EmptyState title="No team yet" message="When a coach adds you to a team, its schedule and news show up here." />
        )}
      </View>
    );
  }

  const teamId = activeTeam.teamId;
  const canScore = activeTeam.isCoach || activeTeam.role === 'scorekeeper';
  const dashboard = query.data;
  const tiles = dashboard ? recordTiles(dashboard.record, dashboard.recentGames.length) : null;
  const channelId = dashboard?.announcementChannelId;

  return (
    <ScrollView
      className="flex-1 bg-gray-50"
      contentContainerStyle={{ paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />}
    >
      <TeamSwitcher />
      <View className="px-4 pt-5 pb-3">
        <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          {view === 'league' && dashboard?.league ? dashboard.league.name : 'Team dashboard'}
        </Text>
        <Text className="text-2xl font-bold text-gray-900 mt-0.5">{activeTeam.teamName}</Text>
        {dashboard?.league && (
          <View className="mt-3">
            <SegmentedControl
              options={[
                { value: 'team', label: 'My team' },
                { value: 'league', label: dashboard.league.name },
              ]}
              value={view}
              onChange={setView}
            />
          </View>
        )}
      </View>

      {isSyncing && (
        <View className="mx-4 mb-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2">
          <Text className="text-blue-700 text-sm">Syncing...</Text>
        </View>
      )}

      <View className="px-4">
        {canScore && <ResumeScoringCards teamId={teamId} />}

        {!dashboard ? (
          query.isPending ? (
            <View className="py-10 items-center">
              <ActivityIndicator />
            </View>
          ) : (
            <ErrorState message={describeApiError(query.error)} onRetry={() => void query.refetch()} />
          )
        ) : (
          <>
            {remoteLiveGames(dashboard.liveGames, teamId, canScore).map((game) => (
              <LiveGameRow key={game.id} game={game} activeTeamId={teamId} />
            ))}

            <NextUpCard game={dashboard.nextGame} activeTeamId={teamId} isCoach={activeTeam.isCoach} />

            {tiles && (
              <View className="flex-row gap-3 mb-3">
                <StatTile label="Recent record" value={tiles.record} detail={tiles.tracked} />
                <StatTile label="Run diff" value={tiles.runDiff} detail={tiles.runs} tone={tiles.trend} />
              </View>
            )}

            <DashboardCard
              title="Upcoming games"
              action={<CardAction label="Schedule" onPress={() => router.push({ pathname: '/(tabs)/schedule', params: { view: 'games' } })} />}
            >
              <UpcomingList
                items={dashboard.upcoming.filter((i) => i.kind === 'game')}
                activeTeamId={teamId}
                emptyText="No games scheduled in the next 4 weeks."
              />
            </DashboardCard>

            <DashboardCard
              title="Practices & events"
              action={<CardAction label="Full schedule" onPress={() => router.push({ pathname: '/(tabs)/schedule', params: { view: 'all' } })} />}
            >
              <UpcomingList
                items={dashboard.upcoming.filter((i) => i.kind !== 'game')}
                activeTeamId={teamId}
                emptyText="No practices or events scheduled."
              />
            </DashboardCard>

            <DashboardCard
              title="Announcements"
              action={
                channelId ? (
                  <CardAction label="Post" onPress={() => router.push({ pathname: '/(tabs)/messages/[channelId]', params: { channelId } })} />
                ) : (
                  <CardAction label="Messages" onPress={() => router.push('/(tabs)/messages')} />
                )
              }
            >
              <AnnouncementList announcements={dashboard.announcements} />
            </DashboardCard>

            <DashboardCard title="Recent games">
              <RecentGamesList games={dashboard.recentGames} activeTeamId={teamId} />
            </DashboardCard>
          </>
        )}
      </View>
    </ScrollView>
  );
}
