import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '../../src/providers/AuthProvider';
import { useSyncContext } from '../../src/providers/SyncProvider';

export default function HomeScreen() {
  const { user, signOut } = useAuth();
  const { isSyncing, triggerSync } = useSyncContext();

  return (
    <ScrollView className="flex-1 bg-gray-50">
      <View className="px-5 pt-6 pb-4">
        <Text className="text-2xl font-bold text-gray-900">Dashboard</Text>
        <Text className="text-gray-500 text-sm mt-1">{user?.email}</Text>
      </View>

      {isSyncing && (
        <View className="mx-5 mb-4 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2">
          <Text className="text-blue-700 text-sm">Syncing...</Text>
        </View>
      )}

      <View className="px-5 space-y-3">
        <TouchableOpacity
          className="bg-white rounded-xl border border-gray-200 p-5"
          onPress={() => router.push('/(tabs)/games/index')}
        >
          <Text className="text-lg font-semibold text-gray-900 mb-1">Today's Games</Text>
          <Text className="text-gray-500 text-sm">View schedule and score a game</Text>
        </TouchableOpacity>

        <TouchableOpacity
          className="bg-white rounded-xl border border-gray-200 p-5"
          onPress={() => router.push('/(tabs)/roster/index')}
        >
          <Text className="text-lg font-semibold text-gray-900 mb-1">Roster</Text>
          <Text className="text-gray-500 text-sm">Players and pitch counts</Text>
        </TouchableOpacity>

        <TouchableOpacity
          className="bg-white rounded-xl border border-gray-200 p-5"
          onPress={() => router.push('/(tabs)/messages/index')}
        >
          <Text className="text-lg font-semibold text-gray-900 mb-1">Messages</Text>
          <Text className="text-gray-500 text-sm">Team channels and announcements</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        className="mx-5 mt-8 mb-6 py-3 rounded-xl border border-gray-300 items-center"
        onPress={signOut}
      >
        <Text className="text-gray-600 font-medium">Sign out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
