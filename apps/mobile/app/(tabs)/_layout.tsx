import { Redirect, Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/providers/AuthProvider';

type IoniconName = keyof typeof Ionicons.glyphMap;

function tabIcon(filled: IoniconName, outline: IoniconName) {
  return ({ focused, color, size }: { focused: boolean; color: string; size: number }) => (
    <Ionicons name={focused ? filled : outline} color={color} size={size} />
  );
}

export default function TabLayout() {
  const { user } = useAuth();

  if (!user) {
    return <Redirect href="/(auth)/sign-in" />;
  }

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#1e3a8a',
        tabBarStyle: { borderTopColor: '#e5e7eb' },
        headerStyle: { backgroundColor: '#1e3a8a' },
        headerTintColor: '#ffffff',
        headerTitleStyle: { fontWeight: '700' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Home', tabBarLabel: 'Home', tabBarIcon: tabIcon('home', 'home-outline') }}
      />
      <Tabs.Screen
        name="games/index"
        options={{ title: 'Games', tabBarLabel: 'Games', tabBarIcon: tabIcon('baseball', 'baseball-outline') }}
      />
      <Tabs.Screen
        name="practices/index"
        options={{ title: 'Practices', tabBarLabel: 'Practices', tabBarIcon: tabIcon('clipboard', 'clipboard-outline') }}
      />
      <Tabs.Screen
        name="roster/index"
        options={{ title: 'Roster', tabBarLabel: 'Roster', tabBarIcon: tabIcon('people', 'people-outline') }}
      />
      <Tabs.Screen
        name="messages/index"
        options={{ title: 'Messages', tabBarLabel: 'Messages', tabBarIcon: tabIcon('chatbubbles', 'chatbubbles-outline') }}
      />
      {/* Nested detail routes live under (tabs) for layout/context reasons but
          are not top-level destinations — Expo Router auto-registers every
          file under a (tabs) group as its own tab unless hidden here, which
          was surfacing 6 extra unstyled, icon-less tabs. */}
      <Tabs.Screen name="games/[gameId]/score" options={{ href: null }} />
      <Tabs.Screen name="games/[gameId]/lineup" options={{ href: null }} />
      <Tabs.Screen name="messages/[channelId]" options={{ href: null }} />
      <Tabs.Screen name="practices/[practiceId]/attendance" options={{ href: null }} />
      <Tabs.Screen name="practices/[practiceId]/card" options={{ href: null }} />
    </Tabs>
  );
}
