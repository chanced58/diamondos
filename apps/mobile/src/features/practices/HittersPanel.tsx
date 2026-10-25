import { Text, View } from 'react-native';
import type { PracticeDetailResponse, PracticeRosterPlayer } from '@baseball/shared';

type Hitters = NonNullable<PracticeDetailResponse['coach']>['hitters'];

/**
 * Hot and cold hitters from the team's last 3 days of logged reps (the web
 * "Recent BP performance" panel). Hidden until any rep is logged.
 */
export function HittersPanel({ hitters, players }: { hitters: Hitters; players: PracticeRosterPlayer[] }) {
  if (hitters.totalReps === 0) return null;
  const byId = new Map(players.map((p) => [p.id, p]));
  const name = (playerId: string) => {
    const p = byId.get(playerId);
    return p ? `${p.lastName}, ${p.firstName}${p.jerseyNumber != null ? ` #${p.jerseyNumber}` : ''}` : 'Unknown';
  };

  return (
    <View className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
      <View className="flex-row items-center justify-between mb-2">
        <Text className="text-sm font-semibold text-gray-900">Recent BP performance</Text>
        <Text className="text-xs text-gray-500">{hitters.totalReps} reps · last 3 days</Text>
      </View>
      {hitters.hot.length === 0 && hitters.cold.length === 0 && (
        <Text className="text-xs text-gray-500">No hitter has enough reps (5+ in the last 3 days) to rank yet.</Text>
      )}
      {hitters.hot.length > 0 && (
        <View className="mb-3">
          <Text className="text-xs font-semibold text-emerald-700 uppercase tracking-wide mb-1">Hot</Text>
          {hitters.hot.map((h) => (
            <View key={h.playerId} className="flex-row justify-between py-1">
              <Text className="text-sm text-gray-900">
                <Text className="text-gray-400">#{h.rank} </Text>
                {name(h.playerId)}
              </Text>
              <Text className="text-xs text-gray-600">{h.qualityReps}/{h.totalReps} quality</Text>
            </View>
          ))}
        </View>
      )}
      {hitters.cold.length > 0 && (
        <View>
          <Text className="text-xs font-semibold text-red-700 uppercase tracking-wide mb-1">Cold</Text>
          {hitters.cold.map((h) => (
            <View key={h.playerId} className="flex-row justify-between py-1">
              <Text className="text-sm text-gray-900">{name(h.playerId)}</Text>
              <Text className="text-xs text-gray-600">{h.qualityReps}/{h.totalReps} quality</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
