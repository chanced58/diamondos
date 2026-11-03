import { render } from '@testing-library/react-native';
import { Text } from 'react-native';
import { DarkTheme, DefaultTheme, useTheme } from '@react-navigation/native';
import { SEMANTIC_TOKENS } from '@baseball/shared';
import { ThemeScope } from '../../theme/ThemeScope';
import { NavigationThemeProvider } from '../NavigationThemeProvider';
import { navigationThemeFor } from '../navigation-theme';

describe('navigationThemeFor', () => {
  it('should return the default theme untouched for Light', () => {
    expect(navigationThemeFor('light')).toBe(DefaultTheme);
  });

  it('should paint the dark background, card, text and border from the tokens', () => {
    const theme = navigationThemeFor('dark');

    expect(theme.dark).toBe(true);
    expect(theme.colors.background).toBe('#0f1115');
    expect(theme.colors.card).toBe('#181b22');
    expect(theme.colors.text).toBe('#e7e9ee');
    expect(theme.colors.border).toBe('#2a2f3a');
    expect(theme.colors.primary).toBe('#60a5fa');
  });

  it('should keep the notification color from the base dark theme', () => {
    expect(navigationThemeFor('dark').colors.notification).toBe(DarkTheme.colors.notification);
  });

  it('should use the dugout tokens for Dugout', () => {
    const theme = navigationThemeFor('dugout');

    expect(theme.dark).toBe(true);
    expect(theme.colors.background).toBe(SEMANTIC_TOKENS.dugout.bg);
    expect(theme.colors.card).toBe(SEMANTIC_TOKENS.dugout.surface);
    expect(theme.colors.primary).toBe(SEMANTIC_TOKENS.dugout['brand-2']);
  });
});

describe('NavigationThemeProvider', () => {
  function Probe({ testID }: { testID: string }) {
    const { colors, dark } = useTheme();
    return <Text testID={testID}>{`${dark}:${colors.background}`}</Text>;
  }

  it('should supply the dark navigation theme inside a dark scope', () => {
    const { getByTestId } = render(
      <ThemeScope theme="dark">
        <NavigationThemeProvider>
          <Probe testID="p" />
        </NavigationThemeProvider>
      </ThemeScope>,
    );

    expect(getByTestId('p').props.children).toBe('true:#0f1115');
  });

  it('should supply the default navigation theme inside a light scope under a dark one', () => {
    const { getByTestId } = render(
      <ThemeScope theme="dark">
        <NavigationThemeProvider>
          <ThemeScope theme="light">
            <NavigationThemeProvider>
              <Probe testID="inner" />
            </NavigationThemeProvider>
          </ThemeScope>
        </NavigationThemeProvider>
      </ThemeScope>,
    );

    expect(getByTestId('inner').props.children).toBe(`false:${DefaultTheme.colors.background}`);
  });
});
