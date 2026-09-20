import { Alert } from 'react-native';
import { render, fireEvent, screen } from '@testing-library/react-native';
import { PlayFeed, toFeedItems } from '../PlayFeed';
import type { PlayFeedRow } from '../use-play-feed';

/**
 * Covers Finding 2: PlayFeed's long-press -> confirm -> onVoid interaction
 * and its disabled gating — the feature's primary entry point (a coach
 * actually reaching a play to void), previously untested. `use-play-feed
 * .test.ts` only covers row construction; this covers the rendered
 * component's behavior on top of those rows, the same level PitchInput's
 * sacrifice-gating tests (pitch-input-sacrifice.test.tsx) exercise.
 *
 * Alert.alert is a native module with no real implementation in the test
 * environment, so it's mocked here to synchronously invoke the destructive
 * ("Void") button's onPress, rather than trying to drive a native dialog.
 */

function actionableRow(overrides: Partial<PlayFeedRow> = {}): PlayFeedRow {
  return {
    eventId: 'evt-1',
    inning: 3,
    isTopOfInning: true,
    description: 'Alice — double',
    isVoided: false,
    ...overrides,
  };
}

function voidedRow(overrides: Partial<PlayFeedRow> = {}): PlayFeedRow {
  return actionableRow({ isVoided: true, description: 'Bob — single', ...overrides });
}

function correctionMarkerRow(overrides: Partial<PlayFeedRow> = {}): PlayFeedRow {
  return actionableRow({
    eventId: 'evt-revert',
    isCorrectionMarker: true,
    description: '— 2 entries reverted —',
    ...overrides,
  });
}

/** Mocks Alert.alert to immediately press the button matching `buttonText`
 * (defaults to the destructive "Void" button) whenever it's called. */
function mockAlertPressing(buttonText = 'Void') {
  return jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
    const button = buttons?.find((b) => b.text === buttonText);
    button?.onPress?.();
  });
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('PlayFeed long-press void interaction', () => {
  it('long-pressing an actionable row confirms via Alert, then calls onVoid with the row eventId', () => {
    const alertSpy = mockAlertPressing('Void');
    const onVoid = jest.fn();
    const row = actionableRow({ eventId: 'evt-42', description: 'Alice — home run' });
    render(<PlayFeed rows={[row]} onVoid={onVoid} />);

    fireEvent(screen.getByText('Alice — home run'), 'longPress');

    expect(alertSpy).toHaveBeenCalledWith(
      'Void this play?',
      expect.stringContaining('Alice — home run'),
      expect.any(Array),
    );
    expect(onVoid).toHaveBeenCalledTimes(1);
    expect(onVoid).toHaveBeenCalledWith('evt-42');
  });

  it('does not call onVoid when the confirmation is cancelled', () => {
    mockAlertPressing('Cancel');
    const onVoid = jest.fn();
    render(<PlayFeed rows={[actionableRow()]} onVoid={onVoid} />);

    fireEvent(screen.getByText('Alice — double'), 'longPress');

    expect(onVoid).not.toHaveBeenCalled();
  });

  it('does nothing on long-press of an already-voided row', () => {
    const alertSpy = mockAlertPressing('Void');
    const onVoid = jest.fn();
    render(<PlayFeed rows={[voidedRow()]} onVoid={onVoid} />);

    fireEvent(screen.getByText('Bob — single'), 'longPress');

    expect(alertSpy).not.toHaveBeenCalled();
    expect(onVoid).not.toHaveBeenCalled();
  });

  it('does nothing on long-press of a correction-marker (reverted span) row', () => {
    const alertSpy = mockAlertPressing('Void');
    const onVoid = jest.fn();
    render(<PlayFeed rows={[correctionMarkerRow()]} onVoid={onVoid} />);

    fireEvent(screen.getByText('— 2 entries reverted —'), 'longPress');

    expect(alertSpy).not.toHaveBeenCalled();
    expect(onVoid).not.toHaveBeenCalled();
  });

  it('nothing is actionable when onVoid is not supplied', () => {
    const alertSpy = mockAlertPressing('Void');
    render(<PlayFeed rows={[actionableRow()]} />);

    fireEvent(screen.getByText('Alice — double'), 'longPress');

    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('confirms with each row\'s own eventId when multiple actionable rows are present', () => {
    const alertSpy = mockAlertPressing('Void');
    const onVoid = jest.fn();
    const rows = [
      actionableRow({ eventId: 'evt-1', description: 'Alice — double', inning: 2, isTopOfInning: true }),
      actionableRow({ eventId: 'evt-2', description: 'Bob — triple', inning: 1, isTopOfInning: true }),
    ];
    render(<PlayFeed rows={rows} onVoid={onVoid} />);

    fireEvent(screen.getByText('Bob — triple'), 'longPress');
    expect(onVoid).toHaveBeenCalledWith('evt-2');

    fireEvent(screen.getByText('Alice — double'), 'longPress');
    expect(onVoid).toHaveBeenCalledWith('evt-1');

    expect(onVoid).toHaveBeenCalledTimes(2);
    expect(alertSpy).toHaveBeenCalledTimes(2);
  });
});

describe('PlayFeed grouping and key uniqueness', () => {
  it('production case: Top 1 -> Top 2 -> Bot 1 -> Top 1 produces four headers with all distinct keys', () => {
    // Reproduces the real game scenario from the finding: the coach voided
    // events and resumed, causing Top 1 to appear twice non-contiguously.
    const rows = [
      // Newest first, so the second Top 1 appears first
      actionableRow({ eventId: 'evt-54', description: 'Charlie — out', inning: 1, isTopOfInning: true }),
      actionableRow({ eventId: 'evt-53', description: 'Alice — single', inning: 1, isTopOfInning: true }),
      // Then Bot 1
      actionableRow({ eventId: 'evt-30', description: 'Dave — double', inning: 1, isTopOfInning: false }),
      // Then Top 2
      actionableRow({ eventId: 'evt-28', description: 'Eve — home run', inning: 2, isTopOfInning: true }),
      // Finally the first Top 1 (oldest)
      actionableRow({ eventId: 'evt-10', description: 'Bob — walk', inning: 1, isTopOfInning: true }),
    ];

    const items = toFeedItems(rows);

    // Count headers
    const headers = items.filter((item) => item.kind === 'header');
    expect(headers).toHaveLength(4);

    // Verify all keys are distinct
    const allKeys = items.map((item) => item.key);
    const uniqueKeys = new Set(allKeys);
    expect(uniqueKeys.size).toBe(allKeys.length);
    expect(uniqueKeys.size).toBe(9); // 4 headers + 5 rows
  });

  it('simple contiguous case: Top 1 then Bot 1 produces two headers with distinct keys', () => {
    const rows = [
      actionableRow({ eventId: 'evt-2', description: 'Alice — single', inning: 1, isTopOfInning: false }),
      actionableRow({ eventId: 'evt-1', description: 'Bob — walk', inning: 1, isTopOfInning: true }),
    ];

    const items = toFeedItems(rows);

    const headers = items.filter((item) => item.kind === 'header');
    expect(headers).toHaveLength(2);
    expect(headers[0].label).toBe('Bot 1');
    expect(headers[1].label).toBe('Top 1');

    // All keys distinct
    const allKeys = items.map((item) => item.key);
    const uniqueKeys = new Set(allKeys);
    expect(uniqueKeys.size).toBe(allKeys.length);
  });

  it('row items still key on eventId', () => {
    const rows = [
      actionableRow({ eventId: 'evt-100', description: 'Alice — out', inning: 1, isTopOfInning: true }),
      actionableRow({ eventId: 'evt-99', description: 'Bob — double', inning: 1, isTopOfInning: true }),
    ];

    const items = toFeedItems(rows);

    const rowItems = items.filter((item) => item.kind === 'row');
    expect(rowItems).toHaveLength(2);
    expect(rowItems[0].key).toBe('evt-100');
    expect(rowItems[1].key).toBe('evt-99');
  });

  it('all keys in the emitted list are unique regardless of half-inning repeats', () => {
    // Extended case with multiple repeats
    const rows = [
      actionableRow({ eventId: 'e1', description: 'Play 1', inning: 1, isTopOfInning: true }),
      actionableRow({ eventId: 'e2', description: 'Play 2', inning: 2, isTopOfInning: true }),
      actionableRow({ eventId: 'e3', description: 'Play 3', inning: 1, isTopOfInning: false }),
      actionableRow({ eventId: 'e4', description: 'Play 4', inning: 1, isTopOfInning: true }),
      actionableRow({ eventId: 'e5', description: 'Play 5', inning: 2, isTopOfInning: false }),
      actionableRow({ eventId: 'e6', description: 'Play 6', inning: 1, isTopOfInning: true }),
    ];

    const items = toFeedItems(rows);
    const allKeys = items.map((item) => item.key);
    const uniqueKeys = new Set(allKeys);

    // Should have no duplicates
    expect(uniqueKeys.size).toBe(allKeys.length);
  });
});
