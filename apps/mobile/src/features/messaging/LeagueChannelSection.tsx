import { Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import type { LeagueChannelsResponse } from '@baseball/shared';
import { describeApiError } from '../../lib/api-client';

export interface LeagueSectionState {
  data: LeagueChannelsResponse | undefined;
  error: unknown;
  refetch: () => unknown;
}

function SectionLabel({ children }: { children: string }) {
  return <Text className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2 mt-1">{children}</Text>;
}

/**
 * The team's league channels the user is in, above the team's own, as in the
 * web sidebar. Online-only: offline, the team channels still list.
 */
export function LeagueChannelSection({ league }: { league: LeagueSectionState }) {
  if (league.error && !league.data) {
    return (
      <TouchableOpacity accessibilityRole="button" onPress={() => void league.refetch()} className="mb-4">
        <Text className="text-xs text-gray-400">League channels: {describeApiError(league.error)} Tap to retry.</Text>
      </TouchableOpacity>
    );
  }
  const channels = league.data?.channels ?? [];
  if (channels.length === 0) return null;

  return (
    <View className="mb-2">
      <SectionLabel>{league.data?.leagueName ?? 'League'}</SectionLabel>
      {channels.map((channel) => (
        <TouchableOpacity
          key={channel.id}
          className="bg-white rounded-xl border border-amber-200 px-4 py-3.5 mb-2 flex-row items-center"
          onPress={() => router.push({ pathname: '/(tabs)/messages/league/[channelId]', params: { channelId: channel.id } })}
        >
          <Text className="text-2xl mr-3">🏆</Text>
          <View className="flex-1">
            <Text className="font-semibold text-gray-900">{channel.name}</Text>
            {channel.description && (
              <Text className="text-gray-500 text-sm" numberOfLines={1}>
                {channel.description}
              </Text>
            )}
          </View>
          {!channel.canPost && <Text className="text-xs text-gray-400 ml-2">Read-only</Text>}
        </TouchableOpacity>
      ))}
      <SectionLabel>Team</SectionLabel>
    </View>
  );
}
