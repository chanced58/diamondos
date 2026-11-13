import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { ScrollView, Text } from 'react-native';
import { PhoneBookPane } from '../PhoneBookPane';

/**
 * On a phone the book scrolls under the pad, and the controls below the fold
 * (their pitcher, the batting order's Change and + Batter) went unfound. The
 * pane shows a chip while anything is out of sight. RNTL does no real layout,
 * so the sizes are fed through the scroll view's own callbacks.
 */

function renderPane() {
  render(
    <PhoneBookPane moreLabel="Their pitcher & batting order">
      <Text>Book contents</Text>
    </PhoneBookPane>,
  );
  return screen.UNSAFE_getByType(ScrollView);
}

function measure(scroll: ReturnType<typeof renderPane>, viewport: number, content: number) {
  act(() => {
    fireEvent(scroll, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 402, height: viewport } } });
    fireEvent(scroll, 'contentSizeChange', 402, content);
  });
}

describe('PhoneBookPane', () => {
  it('should show the more-below chip while the book overflows', () => {
    const scroll = renderPane();
    measure(scroll, 200, 560);
    expect(screen.getByText('Their pitcher & batting order ▾')).toBeTruthy();
    expect(screen.getByLabelText('Scroll down to Their pitcher & batting order')).toBeTruthy();
  });

  it('should hide the chip once the book is scrolled to the end', () => {
    const scroll = renderPane();
    measure(scroll, 200, 560);
    act(() => {
      fireEvent.scroll(scroll, { nativeEvent: { contentOffset: { x: 0, y: 360 } } });
    });
    expect(screen.queryByTestId('book-more-below')).toBeNull();
  });

  it('should show no chip when the book fits', () => {
    const scroll = renderPane();
    measure(scroll, 400, 380);
    expect(screen.queryByTestId('book-more-below')).toBeNull();
  });

  it('should scroll to the end when the chip is tapped', () => {
    const scrollToEnd = jest.spyOn(ScrollView.prototype, 'scrollToEnd').mockImplementation(() => {});
    const scroll = renderPane();
    measure(scroll, 200, 560);
    fireEvent.press(screen.getByTestId('book-more-below'));
    expect(scrollToEnd).toHaveBeenCalledWith({ animated: true });
    scrollToEnd.mockRestore();
  });

  it('should keep its 200pt floor on phones', () => {
    renderPane();
    expect(screen.getByTestId('book-pane-phone').props.style).toMatchObject({ minHeight: 200, flexBasis: 0 });
  });
});
