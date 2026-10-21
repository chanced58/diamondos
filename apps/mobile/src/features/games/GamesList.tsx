import { useMemo } from 'react';
import { ActivityIndicator, View, Text, FlatList, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Q } from '@nozbe/watermelondb';
import withObservables from '@nozbe/with-observables';
import { map } from 'rxjs';
import { database } from '../../db';
import type { Game } from '../../db/models/Game';
import { formatDate, formatTime } from '@baseball/shared';
import { useRole } from '../../providers/RoleProvider';
import { useGameRsvps } from '../rsvp/useGameRsvps';
import { RsvpButtonRow } from '../rsvp/RsvpButtonRow';
import { sortGamesForList } from './sort-games-for-list';
import { matchupLabel } from './game-detail-view';
import { TournamentTag } from '../tournaments/TournamentTag';

interface GamesListProps {
  games: Game[];
}

function GamesList({ games }: GamesListProps) {
  const { activeTeam } = useRole();
  const scheduledGameIds = useMemo(
    () => games.filter((g) => g.status === 'scheduled').map((g) => g.remoteId),
    [games],
  );
  const {
    myPlayers,
    rsvpByKey,
    savingKeys,
    setRsvp,
    error: rsvpError,
  } = useGameRsvps(scheduledGameIds);

  if (games.length === 0) {
    return (
      <View className="flex-1 items-center justify-center px-6">
        <Text className="text-gray-400 text-lg text-center">No games scheduled.</Text>
        <Text className="text-gray-400 text-sm text-center mt-1">
          Games are added by coaches on the web dashboard.
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      data={games}
      keyExtractor={(item) => item.id}
      contentContainerStyle={{ padding: 16 }}
      ListHeaderComponent={
        rsvpError ? (
          <View className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">
            <Text className="text-xs text-red-700">{rsvpError}</Text>
          </View>
        ) : null
      }
      renderItem={({ item: game }) => (
        <TouchableOpacity
          className="bg-white rounded-xl border border-gray-200 p-4 mb-3"
          onPress={() =>
            // Every game opens its detail screen, which leads on to the scorer
            // (start, continue or the read-only final), lineup and attendance.
            router.push({ pathname: '/(tabs)/schedule/games/[gameId]', params: { gameId: game.remoteId } })
          }
        >
          <View className="flex-row justify-between items-start mb-1">
            <Text className="font-semibold text-gray-900 text-base flex-1 mr-2">
              {matchupLabel(game.opponentName, game.locationType, game.neutralHomeTeam)}
            </Text>
            <View className="flex-row items-center gap-1.5">
              {game.tournamentId ? <TournamentTag /> : null}
              <StatusBadge status={game.status} />
            </View>
          </View>
          <Text className="text-gray-500 text-sm">
            {formatDate(new Date(game.scheduledAt), game.timeZone)} at {formatTime(new Date(game.scheduledAt), game.timeZone)}
          </Text>
          {game.venueName && (
            <Text className="text-gray-400 text-xs mt-0.5">{game.venueName}</Text>
          )}
          {game.status === 'in_progress' && (
            <View className="mt-2 flex-row items-center gap-2">
              <View className="w-2 h-2 rounded-full bg-red-500" />
              <Text className="text-red-600 text-sm font-medium">
                {game.homeScore}–{game.awayScore} • Inning {game.currentInning}
              </Text>
            </View>
          )}
          {game.status === 'completed' && (
            <View className="mt-2 flex-row items-center gap-2">
              <Text className="text-gray-700 text-sm font-medium">
                {game.homeScore}–{game.awayScore} • Final
              </Text>
            </View>
          )}
          {game.status !== 'cancelled' && (
            <TouchableOpacity
              onPress={() =>
                router.push({
                  pathname: '/(tabs)/schedule/games/[gameId]/lineup',
                  params: { gameId: game.remoteId },
                })
              }
              className="mt-3 self-start px-3 py-1.5 rounded-full bg-gray-100 border border-gray-200"
            >
              <Text className="text-xs font-semibold text-gray-700">Lineup</Text>
            </TouchableOpacity>
          )}

          {game.status === 'scheduled' && activeTeam?.isCoach && (
            <TouchableOpacity
              onPress={() =>
                router.push({
                  pathname: '/(tabs)/schedule/games/[gameId]/attendance',
                  params: { gameId: game.remoteId },
                })
              }
              className="mt-2 self-start px-3 py-1.5 rounded-full bg-blue-50 border border-blue-200"
            >
              <Text className="text-xs font-semibold text-blue-700">RSVPs →</Text>
            </TouchableOpacity>
          )}

          {game.status === 'scheduled' && !activeTeam?.isCoach && myPlayers.length > 0 && (
            <View className="mt-3">
              <RsvpButtonRow
                gameId={game.remoteId}
                players={myPlayers}
                rsvpByKey={rsvpByKey}
                savingKeys={savingKeys}
                onSelect={setRsvp}
              />
            </View>
          )}
        </TouchableOpacity>
      )}
    />
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    scheduled: 'bg-blue-100 text-blue-700',
    in_progress: 'bg-red-100 text-red-700',
    completed: 'bg-gray-100 text-gray-600',
    cancelled: 'bg-gray-100 text-gray-400',
    postponed: 'bg-yellow-100 text-yellow-700',
  };
  const labels: Record<string, string> = {
    scheduled: 'Scheduled',
    in_progress: 'Live',
    completed: 'Final',
    cancelled: 'Cancelled',
    postponed: 'Postponed',
  };

  return (
    <View className={`px-2 py-0.5 rounded-full ${styles[status] ?? 'bg-gray-100'}`}>
      <Text className="text-xs font-medium">{labels[status] ?? status}</Text>
    </View>
  );
}

// Connect to WatermelonDB observable, scoped to the active team. There is no
// `TO` clause on `public_view_in_progress_games` (20260220000010:186-189),
// so an unscoped query mirrors every in-progress game platform-wide — W8's
// pin-to-top then promotes a foreign team's live game to the top of the
// list. Same fact `ScheduleList.tsx`'s local games read and `game-identity.ts`
// already handle; this applies the same team-id scoping here.
const GamesListEnhanced = withObservables(['teamId'], ({ teamId }: { teamId: string }) => ({
  games: database
    .get<Game>('games')
    .query(Q.where('team_id', teamId), Q.sortBy('scheduled_at', Q.asc))
    .observe()
    .pipe(map(sortGamesForList)),
}))((GamesListobs: { games: Game[] }) => <GamesList games={GamesListobs.games} />);

/**
 * The active team's games, for the Schedule tab's "Games" segment: start or
 * resume scoring, open the lineup, RSVP. The tab screen
 * (`app/(tabs)/schedule/index.tsx`) owns the header and team switcher.
 */
export function GamesScreen() {
  const { activeTeam, loading: roleLoading } = useRole();

  if (roleLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-50">
      {/* No active team (still resolving membership, or none) — render the
          empty state rather than falling back to an unscoped, all-teams
          query. */}
      {activeTeam ? <GamesListEnhanced teamId={activeTeam.teamId} /> : <GamesList games={[]} />}
    </View>
  );
}
