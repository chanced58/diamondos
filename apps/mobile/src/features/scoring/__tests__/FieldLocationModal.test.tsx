import { render, fireEvent, screen, act } from '@testing-library/react-native';
import { FieldDiagram } from '../FieldDiagram';
import { FieldLocationModal } from '../FieldLocationModal';

// The SVG drawing is decoration here; the behaviour under test is the touch
// layer and the fielder markers, which are ordinary React Native views.
jest.mock('react-native-svg', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  const Stub = (props: { children?: import('react').ReactNode }) => React.createElement(View, null, props.children);
  return { __esModule: true, default: Stub, Rect: Stub, Path: Stub, Circle: Stub, Polygon: Stub, Line: Stub };
});

/**
 * Real RN `TouchableOpacity` starts a 250ms `Animated.timing` fade whenever
 * its `disabled` prop flips (see `componentDidUpdate` in TouchableOpacity) —
 * exactly what happens to the modal's Next button the instant a location is
 * placed. That animation runs on real timers via the rAF-over-setTimeout
 * polyfill in RN's jest setup, so left unflushed it keeps ticking past the
 * end of the synchronous test body and updates state outside of `act()`.
 * Fake timers plus a flush after every press keep each animation's frames
 * inside `act()`, so it settles before the test (and the suite) moves on.
 */
beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  act(() => {
    jest.runOnlyPendingTimers();
  });
  jest.useRealTimers();
});

/** `fireEvent.press`, then settle any Animated timing it started. */
function press(element: unknown, ...data: unknown[]) {
  fireEvent.press(element as never, ...(data as []));
  act(() => {
    jest.runOnlyPendingTimers();
  });
}

/** Lays the diagram out at the drawing's own 240×200 size, then taps a point in it. */
function tapField(x: number, y: number) {
  fireEvent(screen.getByTestId('field-diagram-frame'), 'layout', {
    nativeEvent: { layout: { width: 240, height: 200 } },
  });
  press(screen.getByTestId('field-diagram'), { nativeEvent: { locationX: x, locationY: y } });
}

describe('FieldDiagram', () => {
  it('should turn a tap into spray coordinates, scaled from the rendered size', () => {
    const onPlaceBall = jest.fn();
    render(<FieldDiagram location={null} selectedFielder={null} onPlaceBall={onPlaceBall} onPressFielder={jest.fn()} />);
    fireEvent(screen.getByTestId('field-diagram-frame'), 'layout', {
      nativeEvent: { layout: { width: 480, height: 400 } },
    });
    // (240, 70) at double size is (120, 35) in the drawing: the deep centre wall.
    press(screen.getByTestId('field-diagram'), { nativeEvent: { locationX: 240, locationY: 70 } });
    expect(onPlaceBall).toHaveBeenCalledWith({ sprayX: 0.5, sprayY: 1 });
  });

  it('should ignore a tap that lands before the diagram has been measured', () => {
    const onPlaceBall = jest.fn();
    render(<FieldDiagram location={null} selectedFielder={null} onPlaceBall={onPlaceBall} onPressFielder={jest.fn()} />);
    press(screen.getByTestId('field-diagram'), { nativeEvent: { locationX: 120, locationY: 35 } });
    expect(onPlaceBall).not.toHaveBeenCalled();
  });

  it('should report a tapped fielder marker without placing the ball', () => {
    const onPlaceBall = jest.fn();
    const onPressFielder = jest.fn();
    render(<FieldDiagram location={null} selectedFielder={null} onPlaceBall={onPlaceBall} onPressFielder={onPressFielder} />);
    fireEvent(screen.getByTestId('field-diagram-frame'), 'layout', {
      nativeEvent: { layout: { width: 240, height: 200 } },
    });
    press(screen.getByTestId('fielder-marker-6'));
    expect(onPressFielder).toHaveBeenCalledWith(6);
    expect(onPlaceBall).not.toHaveBeenCalled();
  });
});

describe('FieldLocationModal', () => {
  it('should not allow Next before a location is placed', () => {
    const onNext = jest.fn();
    render(<FieldLocationModal visible onNext={onNext} onSkip={jest.fn()} />);
    press(screen.getByText('Next'));
    expect(onNext).not.toHaveBeenCalled();
  });

  it('should pre-select the nearest fielder for the tapped location', () => {
    const onNext = jest.fn();
    render(<FieldLocationModal visible onNext={onNext} onSkip={jest.fn()} />);
    // (99, 98) in the drawing is spray (0.36, 0.58): the shortstop's spot.
    tapField(99, 98);
    press(screen.getByText('Next'));
    expect(onNext).toHaveBeenCalledWith({
      sprayX: expect.closeTo(0.36, 6),
      sprayY: expect.closeTo(0.58, 6),
      firstFielder: 6,
    });
  });

  it('should let the scorer pick a different fielder', () => {
    const onNext = jest.fn();
    render(<FieldLocationModal visible onNext={onNext} onSkip={jest.fn()} />);
    tapField(99, 98);
    press(screen.getByTestId('fielder-marker-4'));
    press(screen.getByText('Next'));
    expect(onNext).toHaveBeenCalledWith(expect.objectContaining({ firstFielder: 4 }));
  });

  it('should clear the fielder when the selected marker is tapped again — a ball over the wall', () => {
    const onNext = jest.fn();
    render(<FieldLocationModal visible onNext={onNext} onSkip={jest.fn()} />);
    tapField(120, 10);
    press(screen.getByTestId('fielder-marker-8'));
    press(screen.getByText('Next'));
    expect(onNext).toHaveBeenCalledWith({ sprayX: 0.5, sprayY: 1, firstFielder: null });
  });

  it('should skip without a location', () => {
    const onSkip = jest.fn();
    render(<FieldLocationModal visible onNext={jest.fn()} onSkip={onSkip} />);
    press(screen.getByText('Skip'));
    expect(onSkip).toHaveBeenCalledTimes(1);
  });
});

describe('FieldDiagram without fielders', () => {
  it('should render no fielder markers when fielders are not shown', () => {
    render(
      <FieldDiagram
        location={null}
        selectedFielder={null}
        showFielders={false}
        onPlaceBall={jest.fn()}
        onPressFielder={jest.fn()}
      />,
    );
    fireEvent(screen.getByTestId('field-diagram-frame'), 'layout', {
      nativeEvent: { layout: { width: 240, height: 200 } },
    });
    expect(screen.queryByTestId('fielder-marker-8')).toBeNull();
  });
});

describe('FieldLocationModal for a home run', () => {
  it('should record the location with no fielder and offer no fielder markers', () => {
    const onNext = jest.fn();
    render(<FieldLocationModal visible fielderApplies={false} onNext={onNext} onSkip={jest.fn()} />);
    tapField(120, 10);
    expect(screen.queryByTestId('fielder-marker-8')).toBeNull();
    press(screen.getByText('Next'));
    expect(onNext).toHaveBeenCalledWith({ sprayX: 0.5, sprayY: 1, firstFielder: null });
  });
});
