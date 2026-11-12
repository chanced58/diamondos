import { fireEvent, render, screen } from '@testing-library/react-native';
import { PitchCountStrip } from '../PitchCountStrip';

/**
 * The strip sits above the pad and never scrolls away. On phones, while we
 * bat, it names their pitcher and opens their pitching change, so a league
 * scorer can set their pitcher before the first pitch without finding the
 * row in the scrolling book.
 */

const counts = { pitches: 0, strikes: 0, staffPitches: 0, staffStrikes: 0, status: null };

describe('PitchCountStrip', () => {
  it('should make the pitcher a button that asks for their pitcher', () => {
    const onPressPitcher = jest.fn();
    render(
      <PitchCountStrip
        {...counts}
        pitcherLabel="Set their pitcher ▸"
        pitcherNeeded
        onPressPitcher={onPressPitcher}
        pitcherAccessibilityLabel="Rams pitcher not set. Set their pitcher."
      />,
    );
    fireEvent.press(screen.getByLabelText('Rams pitcher not set. Set their pitcher.'));
    expect(onPressPitcher).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Set their pitcher ▸').props.className).toContain('text-amber-700');
  });

  it('should leave the pitcher as plain text without a handler', () => {
    render(<PitchCountStrip {...counts} pitcherLabel="#7 Alex Kim" />);
    expect(screen.queryByTestId('pitch-strip-their-pitcher')).toBeNull();
    expect(screen.getByText('#7 Alex Kim').props.className).toBe('text-score-11px text-gray-500');
  });
});
