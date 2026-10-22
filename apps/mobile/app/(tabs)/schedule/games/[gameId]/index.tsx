import { useState } from 'react';
import { ActivityIndicator, Alert, Linking, Platform, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Badge, Button, ErrorState, ListRow, SectionHeader } from '@baseball/ui';
import { formatDate, formatTime } from '@baseball/shared';
import { useRole } from '../../../../../src/providers/RoleProvider';
import { useGameRsvps } from '../../../../../src/features/rsvp/useGameRsvps';
import { RsvpButtonRow } from '../../../../../src/features/rsvp/RsvpButtonRow';
import { useGameActions, useGameDetail } from '../../../../../src/features/games/use-game-detail';
import {
  gameDetailSections,
  locationLabel,
  matchupTitle,
  opponentLabel,
  scoreFromOurSide,
  statusBadge,
} from '../../../../../src/features/games/game-detail-view';
import { GameTakeawaysCard } from '../../../../../src/features/games/GameTakeawaysCard';
import { ReconciliationCard } from '../../../../../src/features/games/ReconciliationCard';
import { ListGroup } from '../../../../../src/features/navigation/ListGroup';
import { describeApiError } from '../../../../../src/lib/api-client';

/**
 * A game's home screen (the web's /games/[gameId]): details, RSVP, the way
 * into the scorer, coach takeaways, reconciliation, and coach actions.
 * Online-only — the offline-first scorer itself is one tap away.
 */
export default function GameDetailScreen() {
  const { gameId = '' } = useLocalSearchParams<{ gameId: string }>();
  const { memberships } = useRole();
  const detailQuery = useGameDetail(gameId);
  const actions = useGameActions(gameId);
  const [savingOverrideKey, setSavingOverrideKey] = useState<string | null>(null);

  const detail = detailQuery.data;
  const role = memberships.find((m) => m.teamId === detail?.game.teamId);
  const canScore = Boolean(detail?.viewer.isCoach || role?.role === 'scorekeeper');
  const sections = detail ? gameDetailSections(detail, canScore) : null;

  const rsvps = useGameRsvps(sections?.rsvpOpen && !detail?.viewer.isCoach ? [gameId] : []);

  if (detailQuery.isPending) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        <Stack.Screen options={{ title: 'Game' }} />
        <ActivityIndicator />
      </View>
    );
  }

  if (!detail || !sections) {
    return (
      <View className="flex-1 bg-gray-50">
        <Stack.Screen options={{ title: 'Game' }} />
        <ErrorState message={describeApiError(detailQuery.error)} onRetry={() => void detailQuery.refetch()} />
      </View>
    );
  }

  const { game } = detail;
  const badge = statusBadge(game.status);
  const score = scoreFromOurSide(game);

  const showError = (title: string) => (error: unknown) => Alert.alert(title, describeApiError(error));

  const openScorer = () =>
    router.push({
      pathname: '/(tabs)/schedule/games/[gameId]/score',
      params: { gameId: game.id, teamId: game.teamId, opponentName: opponentLabel(game) },
    });

  const confirmCancel = () => {
    const cancel = (notifyTeam: boolean) =>
      actions.cancel.mutate(notifyTeam, { onError: showError('Could not cancel the game') });
    Alert.alert('Cancel this game?', 'The game is marked cancelled. Its record is kept.', [
      { text: 'Keep game', style: 'cancel' },
      ...(opponentLabel(game) !== 'TBD'
        ? [{ text: 'Cancel and notify team', style: 'destructive' as const, onPress: () => cancel(true) }]
        : []),
      { text: 'Cancel game', style: 'destructive', onPress: () => cancel(false) },
    ]);
  };

  const confirmReset = () =>
    Alert.alert(
      'Reset this game?',
      'The game returns to scheduled with a 0–0 score. The play-by-play is kept but no longer counts.',
      [
        { text: 'Keep game', style: 'cancel' },
        {
          text: 'Reset game',
          style: 'destructive',
          onPress: () => actions.reset.mutate(undefined, { onError: showError('Could not reset the game') }),
        },
      ],
    );

  // Confirmed like reset and cancel: it overwrites the stored score, so a
  // stray tap must not write to the game.
  const confirmRecalculate = () =>
    Alert.alert('Recalculate the score?', "The stored score is replaced by a replay of the game's play-by-play.", [
      { text: 'Keep score', style: 'cancel' },
      {
        text: 'Recalculate',
        onPress: () =>
          actions.recalculate.mutate(undefined, {
            onSuccess: ({ homeScore, awayScore }) =>
              Alert.alert('Scores recalculated', `Home ${homeScore}, away ${awayScore}, from the play-by-play.`),
            onError: showError('Could not recalculate the score'),
          }),
      },
    ]);

  const override = (conflictKey: string, useAwayValue: boolean) => {
    if (!detail.reconciliation) return;
    setSavingOverrideKey(conflictKey);
    actions.override.mutate(
      { reconciliationId: detail.reconciliation.reconciliationId, conflictKey, useAwayValue },
      { onError: showError('Could not save the override'), onSettled: () => setSavingOverrideKey(null) },
    );
  };

  const openMap = () => {
    if (game.latitude === null || game.longitude === null) return;
    const label = encodeURIComponent(game.venueName ?? opponentLabel(game));
    const url = Platform.select({
      ios: `https://maps.apple.com/?ll=${game.latitude},${game.longitude}&q=${label}`,
      default: `geo:${game.latitude},${game.longitude}?q=${game.latitude},${game.longitude}(${label})`,
    });
    void Linking.openURL(url);
  };

  const editButton = sections.canEdit
    ? () => (
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Edit game"
          hitSlop={8}
          onPress={() => router.push({ pathname: '/(tabs)/schedule/games/[gameId]/edit', params: { gameId: game.id } })}
        >
          <Text className="text-white text-base font-semibold">Edit</Text>
        </TouchableOpacity>
      )
    : undefined;

  return (
    <ScrollView
      className="flex-1 bg-gray-50"
      contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
      refreshControl={
        <RefreshControl refreshing={detailQuery.isRefetching} onRefresh={() => void detailQuery.refetch()} />
      }
    >
      <Stack.Screen options={{ title: matchupTitle(game), headerRight: editButton }} />

      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Text accessibilityRole="header" className="text-2xl font-bold text-gray-900">
            {matchupTitle(game)}
          </Text>
          <Text className="text-sm text-gray-500 mt-1">
            {formatDate(game.scheduledAt, game.timeZone)} · {formatTime(game.scheduledAt, game.timeZone)}
          </Text>
        </View>
        <Badge label={badge.label} variant={badge.variant} />
      </View>

      {(game.status === 'completed' || game.status === 'in_progress') && (
        <View className="bg-white rounded-xl border border-gray-200 p-4 mt-4 flex-row items-center justify-center gap-8">
          <View className="items-center">
            <Text className="text-xs text-gray-500">Us</Text>
            <Text className="text-4xl font-bold text-gray-900">{score.us}</Text>
          </View>
          <Text className="text-xl text-gray-300">—</Text>
          <View className="items-center">
            <Text className="text-xs text-gray-500">{opponentLabel(game)}</Text>
            <Text className="text-4xl font-bold text-gray-900">{score.them}</Text>
          </View>
          {game.status === 'in_progress' && game.currentInning !== null && (
            <Text className="absolute bottom-2 text-xs text-red-600 font-medium">Inning {game.currentInning}</Text>
          )}
        </View>
      )}

      {sections.score && (
        <View className="mt-4">
          {sections.score.kind === 'needs_opponent' ? (
            <View className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <Text className="text-sm text-amber-800">
                Set the opponent before setting lineups or starting the game.
              </Text>
            </View>
          ) : (
            <Button
              label={sections.score.label}
              size="lg"
              variant={sections.score.kind === 'final' ? 'secondary' : 'primary'}
              onPress={openScorer}
            />
          )}
        </View>
      )}

      {sections.rsvpOpen && !detail.viewer.isCoach && rsvps.myPlayers.length > 0 && (
        <>
          <SectionHeader title="Your RSVP" />
          <View className="bg-white rounded-xl border border-gray-200 p-4">
            <RsvpButtonRow
              gameId={game.id}
              players={rsvps.myPlayers}
              rsvpByKey={rsvps.rsvpByKey}
              savingKeys={rsvps.savingKeys}
              onSelect={rsvps.setRsvp}
            />
            {rsvps.error && <Text className="text-xs text-red-700 mt-2">{rsvps.error}</Text>}
          </View>
        </>
      )}

      {detail.takeaways && (
        <View className="mt-4">
          <GameTakeawaysCard takeaways={detail.takeaways} />
        </View>
      )}

      {detail.reconciliation && (
        <View className="mt-4">
          <ReconciliationCard reconciliation={detail.reconciliation} savingKey={savingOverrideKey} onOverride={override} />
        </View>
      )}

      <SectionHeader title="Game recap" />
      <ListGroup>
        {sections.showStatsAndHistory && (
          <ListRow
            title="Box score"
            subtitle="Line score, batting, pitching and fielding"
            onPress={() =>
              router.push({ pathname: '/(tabs)/schedule/games/[gameId]/box-score', params: { gameId: game.id } })
            }
          />
        )}
        {sections.showStatsAndHistory && (
          <ListRow
            title="Play-by-play"
            subtitle={detail.viewer.isCoach ? 'Every pitch and play, with corrections' : 'Every pitch and play'}
            onPress={() =>
              router.push({ pathname: '/(tabs)/schedule/games/[gameId]/history', params: { gameId: game.id } })
            }
          />
        )}
        <ListRow
          title="Game notes"
          subtitle={detail.viewer.isCoach ? 'Overall, coach-only and player notes' : 'Notes from the coach'}
          onPress={() =>
            router.push({ pathname: '/(tabs)/schedule/games/[gameId]/notes', params: { gameId: game.id } })
          }
        />
      </ListGroup>

      {(sections.showLineup || sections.showAttendance || sections.showOpponentLineup) && (
        <>
          <SectionHeader title="Game day" />
          <ListGroup>
            {sections.showLineup && (
              <ListRow
                title={detail.hasLineup ? 'Lineup' : 'Set lineup'}
                subtitle={detail.hasLineup ? 'Batting order and positions' : 'No lineup yet'}
                onPress={() =>
                  router.push({ pathname: '/(tabs)/schedule/games/[gameId]/lineup', params: { gameId: game.id } })
                }
              />
            )}
            {sections.showOpponentLineup && (
              <ListRow
                title="Opponent lineup"
                subtitle="Their roster and batting order"
                onPress={() =>
                  router.push({ pathname: '/(tabs)/schedule/games/[gameId]/opponent-lineup', params: { gameId: game.id } })
                }
              />
            )}
            {sections.showAttendance && (
              <ListRow
                title="Attendance"
                subtitle="Who's going, by player"
                onPress={() =>
                  router.push({ pathname: '/(tabs)/schedule/games/[gameId]/attendance', params: { gameId: game.id } })
                }
              />
            )}
          </ListGroup>
        </>
      )}

      <SectionHeader title="Details" />
      <ListGroup>
        <ListRow title="Location" subtitle={locationLabel(game)} />
        {game.venueName && <ListRow title="Venue" subtitle={game.venueName} />}
        {game.latitude !== null && game.longitude !== null && (
          <ListRow title="Open in Maps" onPress={openMap} />
        )}
        {game.notes && <ListRow title="Notes" subtitle={game.notes} />}
      </ListGroup>

      {(sections.canRecalculate || sections.canReset || sections.canCancel) && (
        <>
          <SectionHeader title="Danger zone" />
          <View className="gap-2">
            {sections.canRecalculate && (
              <Button
                variant="secondary"
                label="Recalculate score from play-by-play"
                loading={actions.recalculate.isPending}
                onPress={confirmRecalculate}
              />
            )}
            {sections.canReset && (
              <Button variant="secondary" label="Reset game" loading={actions.reset.isPending} onPress={confirmReset} />
            )}
            {sections.canCancel && (
              <Button variant="danger" label="Cancel game" loading={actions.cancel.isPending} onPress={confirmCancel} />
            )}
          </View>
        </>
      )}
    </ScrollView>
  );
}
