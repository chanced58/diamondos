import type { ComponentProps } from 'react';
import { Redirect, Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/providers/AuthProvider';
import { useScopeTheme, useThemeColors } from '../../src/theme/ThemeScope';

type IconName = ComponentProps<typeof Ionicons>['name'];

function tabIcon(focused: IconName, unfocused: IconName) {
  return ({ color, size, focused: isFocused }: { color: string; size: number; focused: boolean }) => (
    <Ionicons name={isFocused ? focused : unfocused} size={size} color={color} />
  );
}

/**
 * Five tabs, each owning a nested Stack (its `_layout.tsx`) so detail screens
 * push within the tab — with a back button and swipe-back — instead of
 * switching tabs. The stacks draw the headers, so the tab navigator's own
 * header is off. Tapping the current tab pops its stack to the top.
 */
export default function TabLayout() {
  const { user } = useAuth();
  const theme = useScopeTheme();
  const colors = useThemeColors();

  if (!user) {
    return <Redirect href="/(auth)/sign-in" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        ...(theme === 'light'
          ? { tabBarActiveTintColor: '#1e3a8a', tabBarStyle: { borderTopColor: '#e5e7eb' } }
          : {
              tabBarActiveTintColor: colors['brand-2'],
              tabBarInactiveTintColor: colors['fg-subtle'],
              tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
            }),
      }}
    >
      <Tabs.Screen
        name="(home)"
        options={{ title: 'Home', tabBarIcon: tabIcon('home', 'home-outline') }}
      />
      <Tabs.Screen
        name="schedule"
        options={{ title: 'Schedule', tabBarIcon: tabIcon('calendar', 'calendar-outline') }}
      />
      <Tabs.Screen
        name="messages"
        options={{ title: 'Messages', tabBarIcon: tabIcon('chatbubbles', 'chatbubbles-outline') }}
      />
      <Tabs.Screen
        name="stats"
        options={{ title: 'Stats', tabBarIcon: tabIcon('stats-chart', 'stats-chart-outline') }}
      />
      <Tabs.Screen
        name="more"
        options={{ title: 'More', tabBarIcon: tabIcon('ellipsis-horizontal-circle', 'ellipsis-horizontal-circle-outline') }}
      />
    </Tabs>
  );
}
