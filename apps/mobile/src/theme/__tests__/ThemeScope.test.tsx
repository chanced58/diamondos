import { render } from '@testing-library/react-native';
import { Text } from 'react-native';
import { SEMANTIC_TOKENS } from '@baseball/shared';
import { ThemeScope, useScopeTheme, useThemeColors } from '../ThemeScope';

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
});
