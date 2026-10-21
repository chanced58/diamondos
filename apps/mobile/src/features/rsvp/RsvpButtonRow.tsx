import { View, Text, TouchableOpacity } from 'react-native';
import type { GameRsvpStatus } from '@baseball/shared';
import type { RsvpPlayer } from './useGameRsvps';

const RSVP_OPTIONS: { status: GameRsvpStatus; label: string; activeClass: string }[] = [
  { status: 'attending', label: 'Going', activeClass: 'bg-green-600 border-green-600' },
  { status: 'maybe', label: 'Maybe', activeClass: 'bg-amber-500 border-amber-500' },
  { status: 'not_attending', label: 'Out', activeClass: 'bg-gray-700 border-gray-700' },
];

interface RsvpButtonRowProps {
  gameId: string;
  players: RsvpPlayer[];
  rsvpByKey: Map<string, GameRsvpStatus>;
  savingKeys: Set<string>;
  onSelect: (gameId: string, playerId: string, status: GameRsvpStatus) => void;
}

/**
 * Going / Maybe / Out for each player the viewer answers for (themselves, or
 * linked children). State comes from `useGameRsvps`; keys are
 * `${gameId}:${playerId}`.
 */
export function RsvpButtonRow({ gameId, players, rsvpByKey, savingKeys, onSelect }: RsvpButtonRowProps) {
  return (
    <View className="gap-1.5">
      {players.map((player) => {
        const key = `${gameId}:${player.playerId}`;
        const status = rsvpByKey.get(key);
        const isSaving = savingKeys.has(key);
        return (
          <View key={player.playerId} className="flex-row items-center justify-between">
            {players.length > 1 && (
              <Text className="text-xs text-gray-500 mr-2" numberOfLines={1}>
                {player.playerName.split(' ')[0]}
              </Text>
            )}
            <View className="flex-row gap-1.5">
              {RSVP_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.status}
                  accessibilityRole="button"
                  accessibilityState={{ selected: status === opt.status, busy: isSaving }}
                  accessibilityLabel={`${player.playerName}: ${opt.label}`}
                  disabled={isSaving}
                  onPress={() => onSelect(gameId, player.playerId, opt.status)}
                  className={`px-2.5 py-1 rounded-full border ${isSaving ? 'opacity-50' : ''} ${
                    status === opt.status ? opt.activeClass : 'bg-white border-gray-200'
                  }`}
                >
                  <Text
                    className={`text-xs font-semibold ${status === opt.status ? 'text-white' : 'text-gray-600'}`}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        );
      })}
    </View>
  );
}
