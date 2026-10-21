import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { ApiError } from '../../../lib/api-client';
import { VenueSearchField, type Venue } from '../VenueSearchField';

const mockSearchPlaces = jest.fn();
const mockGetPlace = jest.fn();
jest.mock('../places-api', () => ({
  searchPlaces: (...args: unknown[]) => mockSearchPlaces(...args),
  getPlace: (...args: unknown[]) => mockGetPlace(...args),
}));
jest.mock('../../../lib/supabase', () => ({ getSupabaseClient: jest.fn() }));

function Harness({ onChange }: { onChange: (venue: Venue | null) => void }) {
  return <VenueSearchField value={null} onChange={onChange} />;
}

async function typeAndWait(text: string) {
  fireEvent.changeText(screen.getByLabelText('Venue'), text);
  await act(async () => {
    jest.advanceTimersByTime(350);
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
});
afterEach(() => jest.useRealTimers());

it('should save a typed venue without coordinates as you type', async () => {
  mockSearchPlaces.mockResolvedValue([]);
  const onChange = jest.fn();
  render(<Harness onChange={onChange} />);

  await typeAndWait('Field 2');

  expect(onChange).toHaveBeenLastCalledWith({ name: 'Field 2', address: null, latitude: null, longitude: null, placeId: null });
});

it('should not search until three characters are typed', async () => {
  render(<Harness onChange={jest.fn()} />);
  await typeAndWait('Ri');
  expect(mockSearchPlaces).not.toHaveBeenCalled();
});

it('should pick a suggestion and pass its address and coordinates on', async () => {
  mockSearchPlaces.mockResolvedValue([{ placeId: 'p1', primaryText: 'Riverside Park', secondaryText: 'Boise, ID' }]);
  mockGetPlace.mockResolvedValue({ placeId: 'p1', name: 'Riverside Park', address: '1 Park Way, Boise, ID', latitude: 43.6, longitude: -116.2 });
  const onChange = jest.fn();
  render(<Harness onChange={onChange} />);

  await typeAndWait('Riverside');
  await act(async () => {
    fireEvent.press(screen.getByLabelText('Use Riverside Park'));
  });

  expect(mockGetPlace).toHaveBeenCalledWith('p1', mockSearchPlaces.mock.calls[0][1]);
  expect(onChange).toHaveBeenLastCalledWith({
    name: 'Riverside Park', address: '1 Park Way, Boise, ID', latitude: 43.6, longitude: -116.2, placeId: 'p1',
  });
});

it('should keep searching after one stale suggestion is no longer found', async () => {
  mockSearchPlaces.mockResolvedValue([{ placeId: 'gone', primaryText: 'Old Field', secondaryText: 'Boise, ID' }]);
  mockGetPlace.mockRejectedValue(new ApiError('not_found', 'Venue not found.', { status: 404 }));
  const onChange = jest.fn();
  render(<Harness onChange={onChange} />);

  await typeAndWait('Old Field');
  await act(async () => {
    fireEvent.press(screen.getByLabelText('Use Old Field'));
  });

  // The suggestion's name is kept as a typed venue, and search stays on.
  expect(onChange).toHaveBeenLastCalledWith({ name: 'Old Field', address: 'Boise, ID', latitude: null, longitude: null, placeId: null });
  expect(screen.queryByText(/Venue search is unavailable/)).toBeNull();
  await typeAndWait('Riverside');
  expect(mockSearchPlaces).toHaveBeenCalledTimes(2);
});

it('should fall back to a typed venue when search is unavailable', async () => {
  mockSearchPlaces.mockRejectedValue(new ApiError('server', 'Venue search is not configured.', { status: 503 }));
  render(<Harness onChange={jest.fn()} />);

  await typeAndWait('Riverside');

  expect(screen.getByText(/Venue search is unavailable/)).toBeTruthy();
  // No more searches once it is known to be unavailable.
  await typeAndWait('Riverside Park');
  expect(mockSearchPlaces).toHaveBeenCalledTimes(1);
});
