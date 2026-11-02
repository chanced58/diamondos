import { render } from '@testing-library/react-native';
import { Text } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SEMANTIC_TOKENS } from '@baseball/shared';
import { ThemeScope, useKeyboardAppearance, useScopeTheme, useThemeColors } from '../ThemeScope';

function Probe({ testID }: { testID: string }) {
  const colors = useThemeColors();
  const theme = useScopeTheme();
  return <Text testID={testID}>{`${theme}:${colors.surface}`}</Text>;
}

describe('ThemeScope', () => {
  it('should resolve the light palette outside any scope', () => {
    const { getByTestId } = render(<Probe testID="p" />);

    expect(getByTestId('p').props.children).toBe(`light:${SEMANTIC_TOKENS.light.surface}`);
    expect(SEMANTIC_TOKENS.light.surface).toBe('#ffffff');
  });

  it('should resolve the dark palette inside a dark scope', () => {
    const { getByTestId } = render(
      <ThemeScope theme="dark">
        <Probe testID="p" />
      </ThemeScope>,
    );

    expect(getByTestId('p').props.children).toBe('dark:#181b22');
  });

  it('should resolve colors from the nearest scope when nested', () => {
    const { getByTestId } = render(
      <ThemeScope theme="dark">
        <Probe testID="outer" />
        <ThemeScope theme="light">
          <Probe testID="inner" />
        </ThemeScope>
      </ThemeScope>,
    );

    expect(getByTestId('outer').props.children).toBe('dark:#181b22');
    expect(getByTestId('inner').props.children).toBe('light:#ffffff');
  });

  it('should apply an extra style to the scope view', () => {
    const { toJSON } = render(
      <ThemeScope theme="dark" style={{ padding: 3 }}>
        <Text>x</Text>
      </ThemeScope>,
    );

    expect(JSON.stringify(toJSON())).toContain('"padding":3');
  });

  it.each([
    ['light', 'dark'],
    ['dark', 'light'],
    ['dugout', 'light'],
  ] as const)('should render a StatusBar by default for %s with style %s', (theme, style) => {
    const { UNSAFE_getAllByType } = render(
      <ThemeScope theme={theme}>
        <Text>x</Text>
      </ThemeScope>,
    );

    const bars = UNSAFE_getAllByType(StatusBar);
    expect(bars).toHaveLength(1);
    expect(bars[0].props.style).toBe(style);
  });

  it('should render no StatusBar when statusBar is false', () => {
    const { UNSAFE_queryAllByType } = render(
      <ThemeScope theme="light" statusBar={false}>
        <Text>x</Text>
      </ThemeScope>,
    );

    expect(UNSAFE_queryAllByType(StatusBar)).toHaveLength(0);
  });
});

describe('useKeyboardAppearance', () => {
  function KeyboardProbe() {
    return <Text testID="k">{useKeyboardAppearance()}</Text>;
  }

  it('should be light in Light and dark in Dark and Dugout', () => {
    const light = render(<KeyboardProbe />);
    expect(light.getByTestId('k').props.children).toBe('light');

    const dark = render(
      <ThemeScope theme="dark">
        <KeyboardProbe />
      </ThemeScope>,
    );
    expect(dark.getByTestId('k').props.children).toBe('dark');

    const dugout = render(
      <ThemeScope theme="dugout">
        <KeyboardProbe />
      </ThemeScope>,
    );
    expect(dugout.getByTestId('k').props.children).toBe('dark');
  });
});
