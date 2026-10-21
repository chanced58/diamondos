import { autocompletePlaces, getPlaceDetails } from '../google-places';
import { fakeDb } from '../../__tests__/fake-db';

const TOKEN = '11111111-1111-4111-8111-111111111111';
const coach = { 'team_members.select': { data: [{ id: 'm1' }] } };

function jsonResponse(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) } as Response;
}

const ORIGINAL_KEY = process.env.GOOGLE_MAPS_SERVER_API_KEY;
beforeEach(() => {
  process.env.GOOGLE_MAPS_SERVER_API_KEY = 'server-key';
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  process.env.GOOGLE_MAPS_SERVER_API_KEY = ORIGINAL_KEY;
  jest.restoreAllMocks();
});

describe('autocompletePlaces', () => {
  it('should answer unavailable without calling Google when no server key is set', async () => {
    delete process.env.GOOGLE_MAPS_SERVER_API_KEY;
    const fetchImpl = jest.fn();
    const result = await autocompletePlaces(fakeDb(coach).db, 'coach', { query: 'Riverside', sessionToken: TOKEN }, fetchImpl);
    expect(result).toMatchObject({ ok: false, code: 'unavailable' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('should skip short queries without a billed call', async () => {
    const fetchImpl = jest.fn();
    expect(await autocompletePlaces(fakeDb(coach).db, 'coach', { query: 'Ri', sessionToken: TOKEN }, fetchImpl))
      .toEqual({ ok: true, data: { predictions: [] } });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('should only let coaches search', async () => {
    const fetchImpl = jest.fn();
    const { db } = fakeDb({ 'team_members.select': { data: [] }, 'user_profiles.select': { data: null } });
    expect(await autocompletePlaces(db, 'parent', { query: 'Riverside', sessionToken: TOKEN }, fetchImpl))
      .toMatchObject({ ok: false, code: 'forbidden' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('should send the key and session token and flatten the suggestions', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse(200, {
      suggestions: [
        { placePrediction: { placeId: 'p1', structuredFormat: { mainText: { text: 'Riverside Park' }, secondaryText: { text: 'Boise, ID' } } } },
        { placePrediction: { placeId: 'p2', text: { text: 'Riverside High' } } },
        { queryPrediction: { text: { text: 'riverside fields' } } },
      ],
    }));
    const result = await autocompletePlaces(fakeDb(coach).db, 'coach', { query: 'Riverside', sessionToken: TOKEN }, fetchImpl);
    expect(result).toEqual({ ok: true, data: { predictions: [
      { placeId: 'p1', primaryText: 'Riverside Park', secondaryText: 'Boise, ID' },
      { placeId: 'p2', primaryText: 'Riverside High', secondaryText: null },
    ] } });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://places.googleapis.com/v1/places:autocomplete');
    expect(init.headers['X-Goog-Api-Key']).toBe('server-key');
    expect(JSON.parse(init.body)).toEqual({ input: 'Riverside', sessionToken: TOKEN });
  });

  it('should turn a Google failure into unavailable', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse(403, { error: 'denied' }));
    expect(await autocompletePlaces(fakeDb(coach).db, 'coach', { query: 'Riverside', sessionToken: TOKEN }, fetchImpl))
      .toMatchObject({ ok: false, code: 'unavailable' });
  });
});

describe('getPlaceDetails', () => {
  it('should return the venue in the shape a game stores', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse(200, {
      id: 'p1', displayName: { text: 'Riverside Park' }, formattedAddress: '1 Park Way, Boise, ID',
      location: { latitude: 43.6, longitude: -116.2 },
    }));
    expect(await getPlaceDetails(fakeDb(coach).db, 'coach', { placeId: 'p1', sessionToken: TOKEN }, fetchImpl))
      .toEqual({ ok: true, data: { placeId: 'p1', name: 'Riverside Park', address: '1 Park Way, Boise, ID', latitude: 43.6, longitude: -116.2 } });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(`https://places.googleapis.com/v1/places/p1?sessionToken=${TOKEN}`);
    expect(init.headers['X-Goog-FieldMask']).toBe('id,displayName,formattedAddress,location');
  });

  it('should report a place without coordinates as unavailable', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse(200, { id: 'p1', displayName: { text: 'Somewhere' } }));
    expect(await getPlaceDetails(fakeDb(coach).db, 'coach', { placeId: 'p1', sessionToken: TOKEN }, fetchImpl))
      .toMatchObject({ ok: false, code: 'unavailable' });
  });
});
