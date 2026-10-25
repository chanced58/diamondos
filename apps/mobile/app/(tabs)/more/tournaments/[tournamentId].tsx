import { useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Badge, Button, EmptyState, ErrorState, ListRow, SectionHeader, SegmentedControl } from '@baseball/ui';
import type { StatTier, TournamentDetailResponse } from '@baseball/shared';
import { ListGroup } from '../../../../src/features/navigation/ListGroup';
import { StatTable } from '../../../../src/features/stats/StatTable';
import {
  TIER_OPTIONS,
  pitchingStatColumns,
  seasonBattingColumns,
  seasonBattingTotals,
  seasonPitchingTotals,
} from '../../../../src/features/stats/season-stats-model';
import { useTournament } from '../../../../src/features/tournaments/tournaments-api';
import { gameWhen, statsCaption, statusLabel, tournamentDates } from '../../../../src/features/tournaments/tournament-format';
import { describeApiError, isApiError } from '../../../../src/lib/api-client';

/**
 * One tournament (the web /tournaments/:id page): its team, lineup rules,
 * games and the team's batting and pitching lines from scored tournament
 * games, kept apart from the regular season. A coach of the tournament team
 * adds games here.
 */
export default function TournamentScreen() {
  const { tournamentId = '' } = useLocalSearchParams<{ tournamentId: string }>();
  const query = useTournament(tournamentId);
  const [tier, setTier] = useState<StatTier | null>(null);

  const header = <Stack.Screen options={{ title: query.data?.tournament.name ?? 'Tournament' }} />;
  if (query.isPending) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        {header}
        <ActivityIndicator />
      </View>
    );
  }
  if (!query.data) {
    const notFound = isApiError(query.error) && query.error.kind === 'not_found';
    return (
      <View className="flex-1 bg-gray-50">
        {header}
        {notFound ? (
          <EmptyState title="Tournament not found" message="It may belong to a team you're not on." />
        ) : (
          <ErrorState message={describeApiError(query.error)} onRetry={() => void query.refetch()} />
        )}
      </View>
    );
  }

  const detail = query.data;
  return (
    <ScrollView
      className="flex-1 bg-gray-50"
      contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
      refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />}
    >
      {header}
      <View className="flex-row items-center gap-2 mb-1">
        <Badge label={statusLabel(detail.tournament.status)} variant="warning" />
      </View>
      <Text className="text-2xl font-bold text-gray-900">{detail.tournament.name}</Text>
      <Text className="text-sm text-gray-600 mt-0.5">{tournamentDates(detail.tournament.startDate, detail.tournament.endDate)}</Text>

      <SectionHeader title="Team" />
      <ListGroup>
        <ListRow title={detail.team.name} subtitle="Tournament team" />
      </ListGroup>

      <SectionHeader title="Lineup rules" />
      <ListGroup>
        <ListRow
          title="More than 9 batters"
          right={<Text className="text-sm text-gray-700">{detail.lineupRules.allowExpanded ? `Up to ${detail.lineupRules.maxBatters}` : 'Not allowed'}</Text>}
        />
        <ListRow title="Mid-game expansion" right={<Text className="text-sm text-gray-700">{detail.lineupRules.allowMidGameExtension ? 'Allowed' : 'Not allowed'}</Text>} />
        <ListRow title="Mid-game contraction" right={<Text className="text-sm text-gray-700">{detail.lineupRules.allowMidGameContraction ? 'Allowed' : 'Not allowed'}</Text>} />
      </ListGroup>

      <SectionHeader title="Games" />
      {detail.games.length === 0 ? (
        <Text className="text-sm text-gray-500 mb-2">No games scheduled yet.</Text>
      ) : (
        <ListGroup>
          {detail.games.map((game) => (
            <ListRow
              key={game.id}
              title={game.opponentName ?? 'Opponent TBD'}
              subtitle={`${gameWhen(game.scheduledAt, game.timeZone)} · ${statusLabel(game.status)}`}
              onPress={() => router.push({ pathname: '/(tabs)/schedule/games/[gameId]', params: { gameId: game.id } })}
            />
          ))}
        </ListGroup>
      )}
      {detail.canAddGame && (
        <View className="mt-3">
          <Button
            label="Add game"
            variant="secondary"
            onPress={() =>
              router.push({
                pathname: '/(tabs)/schedule/games/new',
                params: { tournamentId: detail.tournament.id, teamId: detail.team.id, tournamentName: detail.tournament.name },
              })
            }
          />
        </View>
      )}

      <PlayerStats detail={detail} tier={tier ?? detail.defaultTier} onTier={setTier} />
    </ScrollView>
  );
}

/** The team's batting and pitching lines from scored tournament games, with the web's tier switch. */
function PlayerStats({ detail, tier, onTier }: { detail: TournamentDetailResponse; tier: StatTier; onTier: (tier: StatTier) => void }) {
  const { advancedBatting, advancedPitching } = detail.features;
  return (
    <>
      <SectionHeader title="Player stats" />
      <Text className="text-sm text-gray-500 mb-3">{statsCaption(detail.scoredGameCount)}</Text>
      {detail.scoredGameCount > 0 && (
        <>
          <SegmentedControl options={TIER_OPTIONS} value={tier} onChange={onTier} testID="tournament-stats-tier" />
          <Text className="text-sm font-semibold text-gray-900 mt-4 mb-2">Batting</Text>
          <StatTable
            rows={detail.batting}
            rowKey={(row) => row.playerId}
            rowLabel={(row) => row.playerName}
            columns={seasonBattingColumns(tier, advancedBatting)}
            totals={seasonBattingTotals(detail.batting, tier, advancedBatting)}
            emptyText="No plate appearances recorded yet."
          />
          <Text className="text-sm font-semibold text-gray-900 mt-4 mb-2">Pitching</Text>
          <StatTable
            rows={detail.pitching}
            rowKey={(row) => row.playerId}
            rowLabel={(row) => row.playerName}
            columns={pitchingStatColumns(tier, advancedPitching)}
            totals={seasonPitchingTotals(detail.pitching, tier, advancedPitching)}
            emptyText="No pitches recorded yet."
          />
        </>
      )}
    </>
  );
}
