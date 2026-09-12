import { render, fireEvent, screen } from '@testing-library/react-native';
import { PitchInput } from '../PitchInput';

/**
 * Task 12 fix round 2 (task-12-review.md, Important finding): the four
 * strike-zone tests added in round 1 pin reachability/prop-threading, but
 * they render through RNTL, which performs no real layout — they would
 * pass unchanged against the pre-fix buggy code and cannot detect a
 * clipping regression. The actual new logic this task added —
 * `modifiersOverflowing` / `modifiersAtBottom` and the `onLayout` /
 * `onContentSizeChange` / `onScroll` handlers that drive them — had zero
 * coverage despite being unit-testable: RNTL can fire synthetic layout
 * events with chosen dimensions and assert the `modifiers-scroll-hint`
 * testID appears or disappears in response, with no device or real layout
 * pass required.
 *
 * These tests fire exactly those synthetic events at the `ScrollView`
 * (testID `modifiers-scroll-view`) and assert the affordance's presence
 * tracks measured container-vs-content height, including the boundary
 * where they are equal (must NOT show — the affordance's own condition is
 * `content > container + 1`, not `>=`, specifically so a pane that fits
 * exactly doesn't get a false-positive hint).
 */

function noop() {}

function baseProps() {
  return {
    onRecordPitch: noop,
    onRecordHit: noop,
    onRecordOut: noop,
    onRecordStrikeout: noop,
    onRecordError: noop,
    onRecordCatcherInterference: noop,
    onRecordSacFly: noop,
    onRecordSacBunt: noop,
    onRecordFieldersChoice: noop,
    onRecordRunnerOut: noop,
    onRecordWildPitch: noop,
    onRecordPassedBall: noop,
    onRecordBalk: noop,
    onRecordDoublePlay: noop,
    onRecordTriplePlay: noop,
    onRecordPitchingChange: noop,
    onRecordPinchHitter: noop,
    roster: [],
    onUndoLastEvent: noop,
    runnersOnBase: [] as { base: 1 | 2 | 3; runnerId: string }[],
    sacFlyEligible: false,
    sacBuntEligible: false,
    doublePlayEligible: false,
    triplePlayEligible: false,
    sacEligibilityForTrajectory: () => ({ sacFly: false, sacBunt: false }),
  };
}

/** Fires the layout event RN would emit if the ScrollView's rendered
 *  container measured to `height`. */
function layoutTo(height: number) {
  fireEvent(screen.getByTestId('modifiers-scroll-view'), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width: 300, height } },
  });
}

/** Fires the content-size event RN would emit once the ScrollView's
 *  children have been measured to `height`. Matches the real
 *  `onContentSizeChange(width, height)` signature RNTL's fireEvent passes
 *  straight through to the handler. */
function contentSizeTo(height: number) {
  fireEvent(screen.getByTestId('modifiers-scroll-view'), 'contentSizeChange', 300, height);
}

/** Fires a scroll event at a given distance from the bottom of the
 *  content, matching the shape `onScroll` destructures. */
function scrollTo({ contentHeight, containerHeight, offsetY }: {
  contentHeight: number;
  containerHeight: number;
  offsetY: number;
}) {
  fireEvent(screen.getByTestId('modifiers-scroll-view'), 'scroll', {
    nativeEvent: {
      contentOffset: { y: offsetY },
      layoutMeasurement: { height: containerHeight },
      contentSize: { height: contentHeight },
    },
  });
}

describe('PitchInput modifiers pane — measured overflow affordance', () => {
  it('shows no hint before any layout has been measured (container height still 0)', () => {
    render(<PitchInput {...baseProps()} trackPitchType trackPitchLocation />);
    expect(screen.queryByTestId('modifiers-scroll-hint')).toBeNull();
  });

  it('shows no hint when content is smaller than the container', () => {
    render(<PitchInput {...baseProps()} trackPitchType trackPitchLocation />);
    layoutTo(400);
    contentSizeTo(300);
    expect(screen.queryByTestId('modifiers-scroll-hint')).toBeNull();
  });

  it('shows no hint at the boundary where content exactly equals the container', () => {
    render(<PitchInput {...baseProps()} trackPitchType trackPitchLocation />);
    layoutTo(300);
    contentSizeTo(300);
    expect(screen.queryByTestId('modifiers-scroll-hint')).toBeNull();
  });

  it('shows the hint once measured content exceeds the container', () => {
    render(<PitchInput {...baseProps()} trackPitchType trackPitchLocation />);
    // This is the shape of the Critical-finding scenario: the pane has
    // been squeezed (container 150) well below what its content actually
    // needs (320) — no minHeight floor is masking that anymore, so the
    // affordance must catch it.
    layoutTo(150);
    contentSizeTo(320);
    expect(screen.getByTestId('modifiers-scroll-hint')).toBeTruthy();
  });

  it('hides the hint again once the scorer has scrolled to within 8px of the bottom', () => {
    render(<PitchInput {...baseProps()} trackPitchType trackPitchLocation />);
    layoutTo(150);
    contentSizeTo(320);
    expect(screen.getByTestId('modifiers-scroll-hint')).toBeTruthy();

    // distanceFromBottom = contentSize.height - (offsetY + layoutMeasurement.height)
    //                    = 320 - (170 + 150) = 0  (< 8 → at bottom)
    scrollTo({ contentHeight: 320, containerHeight: 150, offsetY: 170 });
    expect(screen.queryByTestId('modifiers-scroll-hint')).toBeNull();
  });

  it('keeps the hint visible while scrolled but still more than 8px from the bottom', () => {
    render(<PitchInput {...baseProps()} trackPitchType trackPitchLocation />);
    layoutTo(150);
    contentSizeTo(320);

    // distanceFromBottom = 320 - (50 + 150) = 120 (>= 8 → not at bottom yet)
    scrollTo({ contentHeight: 320, containerHeight: 150, offsetY: 50 });
    expect(screen.getByTestId('modifiers-scroll-hint')).toBeTruthy();
  });

  it('never shows a hint when only one tracker is on and its content still fits', () => {
    render(<PitchInput {...baseProps()} trackPitchType trackPitchLocation={false} />);
    layoutTo(200);
    contentSizeTo(120);
    expect(screen.queryByTestId('modifiers-scroll-hint')).toBeNull();
  });
});
