import { fireEvent, render, screen } from '@testing-library/react-native';
import { readFileSync } from 'fs';
import { join } from 'path';
import { EmptyState, ErrorState, FormField, ListRow, SectionHeader, SegmentedControl } from '@baseball/ui';
import { Text } from 'react-native';

/** Behaviour of the shared `@baseball/ui` primitives the mobile screens build on. */

describe('ListRow', () => {
  it('should be a button with a chevron when pressable, and call onPress', () => {
    const onPress = jest.fn();
    render(<ListRow title="Roster" subtitle="Players" onPress={onPress} />);

    fireEvent.press(screen.getByRole('button', { name: 'Roster' }));

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Players')).toBeTruthy();
    expect(screen.getByText('›')).toBeTruthy();
  });

  it('should be static with no chevron when not pressable', () => {
    render(<ListRow title="Signed in as" subtitle="coach@example.com" />);

    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByText('›')).toBeNull();
  });

  it('should not fire when disabled', () => {
    const onPress = jest.fn();
    render(<ListRow title="Soon" onPress={onPress} disabled />);

    fireEvent.press(screen.getByRole('button', { name: 'Soon' }));

    expect(onPress).not.toHaveBeenCalled();
  });
});

describe('SegmentedControl', () => {
  const options = [
    { value: 'schedule', label: 'Schedule' },
    { value: 'games', label: 'Games' },
  ] as const;

  it('should mark the selected segment and report a change', () => {
    const onChange = jest.fn();
    render(<SegmentedControl options={options} value="schedule" onChange={onChange} />);

    expect(screen.getByRole('tab', { name: 'Schedule', selected: true })).toBeTruthy();
    fireEvent.press(screen.getByRole('tab', { name: 'Games' }));
    expect(onChange).toHaveBeenCalledWith('games');

    // Pressing the current segment is not a change.
    fireEvent.press(screen.getByRole('tab', { name: 'Schedule' }));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('should never give a segment a shadow class', () => {
    // NativeWind shadows use CSS variables; a segment gaining one after its
    // first render forced a component "upgrade" that crashed the Schedule
    // tab inside the navigator. Selection is shown with a border instead.
    // NativeWind strips className before Jest sees the props, so the check
    // reads the component's class strings from its source.
    const source = readFileSync(
      join(__dirname, '../../../../packages/ui/src/components/SegmentedControl.tsx'),
      'utf8',
    );
    const code = source.replace(/^\s*\/\/.*$/gm, '');
    expect(code).toMatch(/className=/);
    expect(code).not.toMatch(/shadow/);
  });
});

describe('SectionHeader / EmptyState / ErrorState / FormField', () => {
  it('should render a header with an optional action', () => {
    const onPress = jest.fn();
    render(<SectionHeader title="Team" action={{ label: 'Edit', onPress }} />);

    expect(screen.getByRole('header', { name: 'Team' })).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Edit' }));
    expect(onPress).toHaveBeenCalled();
  });

  it('should render an empty state with an action', () => {
    const onPress = jest.fn();
    render(<EmptyState title="No games" message="Coaches add games on the web." action={{ label: 'Refresh', onPress }} />);

    fireEvent.press(screen.getByText('Refresh'));
    expect(onPress).toHaveBeenCalled();
    expect(screen.getByText('Coaches add games on the web.')).toBeTruthy();
  });

  it('should render an error with a retry', () => {
    const onRetry = jest.fn();
    render(<ErrorState message="You're offline." onRetry={onRetry} />);

    expect(screen.getByRole('alert', { name: "You're offline." })).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalled();
  });

  it('should show the error in place of the hint', () => {
    const { rerender } = render(
      <FormField label="Title" hint="Shown to the team" required>
        <Text>control</Text>
      </FormField>,
    );
    expect(screen.getByText('Shown to the team')).toBeTruthy();

    rerender(
      <FormField label="Title" hint="Shown to the team" error="Event title is required.">
        <Text>control</Text>
      </FormField>,
    );
    expect(screen.queryByText('Shown to the team')).toBeNull();
    expect(screen.getByRole('alert', { name: 'Event title is required.' })).toBeTruthy();
  });
});
