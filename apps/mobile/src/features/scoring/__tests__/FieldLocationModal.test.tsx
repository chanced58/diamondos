import { render, fireEvent, screen } from '@testing-library/react-native';
import { FieldDiagram } from '../FieldDiagram';
import { FieldLocationModal } from '../FieldLocationModal';

// The SVG drawing is decoration here; the behaviour under test is the touch
// layer and the fielder markers, which are ordinary React Native views.
jest.mock('react-native-svg', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Stub = (props: { children?: unknown }) => React.createElement(View, null, props.children);
  return { __esModule: true, default: Stub, Rect: Stub, Path: Stub, Circle: Stub, Polygon: Stub, Line: Stub };
});

/** Lays the diagram out at the drawing's own 240×200 size, then taps a point in it. */
function tapField(x: number, y: number) {
  fireEvent(screen.getByTestId('field-diagram-frame'), 'layout', {
    nativeEvent: { layout: { width: 240, height: 200 } },
  });
  fireEvent.press(screen.getByTestId('field-diagram'), { nativeEvent: { locationX: x, locationY: y } });
}

describe('FieldDiagram', () => {
  it('should turn a tap into spray coordinates, scaled from the rendered size', () => {
    const onPlaceBall = jest.fn();
    render(<FieldDiagram location={null} selectedFielder={null} onPlaceBall={onPlaceBall} onPressFielder={jest.fn()} />);
    fireEvent(screen.getByTestId('field-diagram-frame'), 'layout', {
      nativeEvent: { layout: { width: 480, height: 400 } },
    });
    // (240, 70) at double size is (120, 35) in the drawing: the deep centre wall.
    fireEvent.press(screen.getByTestId('field-diagram'), { nativeEvent: { locationX: 240, locationY: 70 } });
    expect(onPlaceBall).toHaveBeenCalledWith({ sprayX: 0.5, sprayY: 1 });
  });

  it('should ignore a tap that lands before the diagram has been measured', () => {
    const onPlaceBall = jest.fn();
    render(<FieldDiagram location={null} selectedFielder={null} onPlaceBall={onPlaceBall} onPressFielder={jest.fn()} />);
    fireEvent.press(screen.getByTestId('field-diagram'), { nativeEvent: { locationX: 120, locationY: 35 } });
    expect(onPlaceBall).not.toHaveBeenCalled();
  });

  it('should report a tapped fielder marker without placing the ball', () => {
    const onPlaceBall = jest.fn();
    const onPressFielder = jest.fn();
    render(<FieldDiagram location={null} selectedFielder={null} onPlaceBall={onPlaceBall} onPressFielder={onPressFielder} />);
    fireEvent(screen.getByTestId('field-diagram-frame'), 'layout', {
      nativeEvent: { layout: { width: 240, height: 200 } },
    });
    fireEvent.press(screen.getByTestId('fielder-marker-6'));
    expect(onPressFielder).toHaveBeenCalledWith(6);
    expect(onPlaceBall).not.toHaveBeenCalled();
  });
});

describe('FieldLocationModal', () => {
  it('should not allow Next before a location is placed', () => {
    const onNext = jest.fn();
    render(<FieldLocationModal visible onNext={onNext} onSkip={jest.fn()} />);
    fireEvent.press(screen.getByText('Next'));
    expect(onNext).not.toHaveBeenCalled();
  });

  it('should pre-select the nearest fielder for the tapped location', () => {
    const onNext = jest.fn();
    render(<FieldLocationModal visible onNext={onNext} onSkip={jest.fn()} />);
    // (99, 98) in the drawing is spray (0.36, 0.58): the shortstop's spot.
    tapField(99, 98);
    fireEvent.press(screen.getByText('Next'));
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
    fireEvent.press(screen.getByTestId('fielder-marker-4'));
    fireEvent.press(screen.getByText('Next'));
    expect(onNext).toHaveBeenCalledWith(expect.objectContaining({ firstFielder: 4 }));
  });

  it('should clear the fielder when the selected marker is tapped again — a ball over the wall', () => {
    const onNext = jest.fn();
    render(<FieldLocationModal visible onNext={onNext} onSkip={jest.fn()} />);
    tapField(120, 10);
    fireEvent.press(screen.getByTestId('fielder-marker-8'));
    fireEvent.press(screen.getByText('Next'));
    expect(onNext).toHaveBeenCalledWith({ sprayX: 0.5, sprayY: 1, firstFielder: null });
  });

  it('should skip without a location', () => {
    const onSkip = jest.fn();
    render(<FieldLocationModal visible onNext={jest.fn()} onSkip={onSkip} />);
    fireEvent.press(screen.getByText('Skip'));
    expect(onSkip).toHaveBeenCalledTimes(1);
  });
});
