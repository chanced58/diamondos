import { Redirect, Tabs } from 'expo-router';
import { useAuth } from '../../src/providers/AuthProvider';

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
        options={{ title: 'Home', tabBarIcon: () => null, tabBarLabel: 'Home' }}
      />
      <Tabs.Screen
        name="games/index"
        options={{ title: 'Games', tabBarLabel: 'Games' }}
      />
      <Tabs.Screen
        name="roster/index"
        options={{ title: 'Roster', tabBarLabel: 'Roster' }}
      />
      <Tabs.Screen
        name="messages/index"
        options={{ title: 'Messages', tabBarLabel: 'Messages' }}
      />
    </Tabs>
  );
}
