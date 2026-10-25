import { View, Text, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Q } from '@nozbe/watermelondb';
import withObservables from '@nozbe/with-observables';
import { weAreHome } from '@baseball/shared';
import { useRole } from '../../providers/RoleProvider';
import { useGameState } from '../scoring/use-game-state';
import { database } from '../../db';
import type { Game } from '../../db/models/Game';
import { liveSituation } from './dashboard-format';

/**
 * Resume control for a game being scored right now.
 *
 * A scorer who backs out mid-game — to check a message, or because the app
 * was killed — otherwise has to remember which game they were on and dig it
 * out of the games list. This puts it first on the home screen, where it is
 * the only thing they are likely to want.
 *
 * The score comes from replaying the local event log rather than from the
 * games mirror's home_score/away_score columns: those are written server-side
 * at finalisation, so mid-game they still read 0-0 while the real score has
 * moved on. Local, so it works offline.
 */
function ResumeScoringCard({ game }: { game: Game }) {
  const { activeTeam } = useRole();
  const { gameState } = useGameState(game.remoteId, game.teamId);

  const isHome = weAreHome(game.locationType, game.neutralHomeTeam ?? null);
  const opponentName = game.opponentName || 'TBD';
  const teamName = activeTeam?.teamName ?? 'Home';
  const ourScore = gameState ? (isHome ? gameState.homeScore : gameState.awayScore) : null;
  const theirScore = gameState ? (isHome ? gameState.awayScore : gameState.homeScore) : null;

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={`Game in progress against ${opponentName}. Resume scoring.`}
      className="bg-white rounded-xl border-2 border-red-200 p-5 mb-3"
      onPress={() =>
        router.push({
          pathname: '/(tabs)/schedule/games/[gameId]/score',
          params: {
            gameId: game.remoteId,
            teamId: game.teamId,
            opponentName,
            teamName,
          },
        })
      }
    >
      <View className="flex-row items-center mb-1.5">
        <View className="w-2 h-2 rounded-full bg-red-500 mr-2" />
        <Text className="text-[11px] font-bold text-red-700 tracking-wide">GAME IN PROGRESS</Text>
      </View>

      <Text className="text-lg font-semibold text-gray-900">vs {opponentName}</Text>

      {gameState ? (
        <Text className="text-gray-500 text-sm mt-0.5">
          <Text className="font-semibold text-gray-900">
            {ourScore}–{theirScore}
          </Text>
          <Text>
            {'  ·  '}
            {liveSituation(gameState)}
          </Text>
        </Text>
      ) : (
        <Text className="text-gray-500 text-sm mt-0.5">Tap to resume scoring</Text>
      )}
    </TouchableOpacity>
  );
}

/**
 * The team's games in progress on this device, each a resume-scoring card.
 * Scoped to one team: a device that has synced games for more than one team
 * would otherwise surface — and offer to resume — another team's live game.
 * Renders nothing when no game is live.
 */
export const ResumeScoringCards = withObservables(['teamId'], ({ teamId }: { teamId: string }) => ({
  games: database
    .get<Game>('games')
    .query(Q.where('status', 'in_progress'), Q.where('team_id', teamId), Q.sortBy('scheduled_at', Q.asc))
    .observe(),
}))(({ games }: { games: Game[] }) => (
  <>
    {games.map((game) => (
      <ResumeScoringCard key={game.id} game={game} />
    ))}
  </>
));
