import { render } from '@testing-library/react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { ActivityIndicator } from 'react-native';
import { LoadingSpinner } from '@baseball/ui';
import { ThemeScope } from '../../../theme/ThemeScope';
import { DateTimeFields } from '../DateTimeFields';

/** Native controls draw from the OS appearance; these props make them follow the app theme. */

describe('DateTimeFields theming', () => {
  const renderIn = (theme: 'light' | 'dark' | 'dugout') =>
    render(
      <ThemeScope theme={theme}>
        <DateTimeFields date="2026-05-01" time="18:30" onChange={() => {}} />
      </ThemeScope>,
    );

  it('should pin a light iOS picker in Light', () => {
    const { UNSAFE_getAllByType } = renderIn('light');

    for (const picker of UNSAFE_getAllByType(DateTimePicker)) {
      expect(picker.props.themeVariant).toBe('light');
    }
  });

  it.each(['dark', 'dugout'] as const)('should force a dark iOS picker in %s', (theme) => {
    const { UNSAFE_getAllByType } = renderIn(theme);

    const pickers = UNSAFE_getAllByType(DateTimePicker);
    expect(pickers).toHaveLength(2);
    for (const picker of pickers) {
      expect(picker.props.themeVariant).toBe('dark');
    }
  });
});

describe('LoadingSpinner color', () => {
  it('should default to the Light brand navy', () => {
    const { UNSAFE_getByType } = render(<LoadingSpinner />);

    expect(UNSAFE_getByType(ActivityIndicator).props.color).toBe('#1e3a8a');
  });

  it('should use the color passed in, full screen too', () => {
    const { UNSAFE_getByType } = render(<LoadingSpinner fullScreen color="#60a5fa" />);

    expect(UNSAFE_getByType(ActivityIndicator).props.color).toBe('#60a5fa');
  });
});
