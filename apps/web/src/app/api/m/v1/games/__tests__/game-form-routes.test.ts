import { NextResponse } from 'next/server';
import { POST as postGame } from '../route';
import { PATCH as patchGame } from '../[gameId]/route';
import { GET as getFormOptions } from '../../teams/[teamId]/game-form-options/route';
import { DELETE as deleteEvent } from '../../team-events/[eventId]/route';
import { GET as getAutocomplete } from '../../places/autocomplete/route';
import { GET as getPlace } from '../../places/[placeId]/route';

const mockRequireApiUser = jest.fn();
const mockCreateGame = jest.fn();
const mockUpdateGame = jest.fn();
const mockLoadGameFormOptions = jest.fn();
const mockDeleteTeamEvent = jest.fn();
const mockAutocomplete = jest.fn();
const mockDetails = jest.fn();

jest.mock('@/lib/api/bearer-auth', () => ({
  ...jest.requireActual('@/lib/api/bearer-auth'),
  requireApiUser: (req: Request) => mockRequireApiUser(req),
}));
jest.mock('@/lib/services/games/create-game', () => ({ createGame: (...a: unknown[]) => mockCreateGame(...a) }));
jest.mock('@/lib/services/games/update-game', () => ({ updateGame: (...a: unknown[]) => mockUpdateGame(...a) }));
jest.mock('@/lib/services/games/load-game-detail', () => ({ loadGameDetail: jest.fn() }));
jest.mock('@/lib/services/games/load-game-form-options', () => ({
  loadGameFormOptions: (...a: unknown[]) => mockLoadGameFormOptions(...a),
}));
jest.mock('@/lib/services/team-events/delete-team-event', () => ({
  deleteTeamEvent: (...a: unknown[]) => mockDeleteTeamEvent(...a),
}));
jest.mock('@/lib/services/places/google-places', () => ({
  autocompletePlaces: (...a: unknown[]) => mockAutocomplete(...a),
  getPlaceDetails: (...a: unknown[]) => mockDetails(...a),
}));

const DB = { name: 'db' };

function request(method: string, url = 'https://example.com/api/m/v1/x', body?: unknown): Request {
  return new Request(url, {
    method,
    headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireApiUser.mockResolvedValue({ user: { id: 'coach-1' }, db: DB });
});

it('should respond 401 from every route without calling a service when unauthenticated', async () => {
  mockRequireApiUser.mockResolvedValue({ response: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) });

  const statuses = await Promise.all([
    postGame(request('POST', undefined, {})),
    patchGame(request('PATCH', undefined, {}), { params: { gameId: 'g' } }),
    getFormOptions(request('GET'), { params: { teamId: 't' } }),
    deleteEvent(request('DELETE'), { params: { eventId: 'e' } }),
    getAutocomplete(request('GET')),
    getPlace(request('GET'), { params: { placeId: 'p' } }),
  ]).then((responses) => responses.map((r) => r.status));

  expect(statuses).toEqual([401, 401, 401, 401, 401, 401]);
  for (const service of [mockCreateGame, mockUpdateGame, mockLoadGameFormOptions, mockDeleteTeamEvent, mockAutocomplete, mockDetails]) {
    expect(service).not.toHaveBeenCalled();
  }
});

it('should create a game with 201 and the body as input', async () => {
  mockCreateGame.mockResolvedValue({ ok: true, data: { gameId: 'g1' } });
  const body = { teamId: 't', date: '2026-10-22', opponentName: 'Eagles' };

  const res = await postGame(request('POST', undefined, body));

  expect(res.status).toBe(201);
  expect(await res.json()).toEqual({ gameId: 'g1' });
  expect(mockCreateGame).toHaveBeenCalledWith(DB, 'coach-1', body);
});

it('should take the edited game id from the path, never the body', async () => {
  mockUpdateGame.mockResolvedValue({ ok: true, data: { gameId: 'path-id' } });

  await patchGame(request('PATCH', undefined, { gameId: 'body-id', date: '2026-10-22' }), { params: { gameId: 'path-id' } });

  expect(mockUpdateGame).toHaveBeenCalledWith(DB, 'coach-1', { gameId: 'path-id', date: '2026-10-22' });
});

it('should map an edit conflict to 409', async () => {
  mockUpdateGame.mockResolvedValue({ ok: false, code: 'conflict', error: 'Cannot clear the opponent…' });
  expect((await patchGame(request('PATCH', undefined, {}), { params: { gameId: 'g' } })).status).toBe(409);
});

it('should load form options and delete events for the path ids', async () => {
  mockLoadGameFormOptions.mockResolvedValue({ ok: true, data: { opponentTeams: [] } });
  mockDeleteTeamEvent.mockResolvedValue({ ok: true, data: { eventId: 'e1' } });

  await getFormOptions(request('GET'), { params: { teamId: 't1' } });
  await deleteEvent(request('DELETE'), { params: { eventId: 'e1' } });

  expect(mockLoadGameFormOptions).toHaveBeenCalledWith(DB, 'coach-1', { teamId: 't1' });
  expect(mockDeleteTeamEvent).toHaveBeenCalledWith(DB, 'coach-1', { eventId: 'e1' });
});

it('should pass the Places query and session token through, mapping unavailable to 503', async () => {
  mockAutocomplete.mockResolvedValue({ ok: false, code: 'unavailable', error: 'Venue search is not configured.' });
  mockDetails.mockResolvedValue({ ok: true, data: { placeId: 'p1' } });

  const searched = await getAutocomplete(request('GET', 'https://example.com/api/m/v1/places/autocomplete?query=Riv&sessionToken=tok'));
  await getPlace(request('GET', 'https://example.com/api/m/v1/places/p1?sessionToken=tok'), { params: { placeId: 'p1' } });

  expect(searched.status).toBe(503);
  expect(await searched.json()).toEqual({ error: 'Venue search is not configured.', code: 'unavailable' });
  expect(mockAutocomplete).toHaveBeenCalledWith(DB, 'coach-1', { query: 'Riv', sessionToken: 'tok' });
  expect(mockDetails).toHaveBeenCalledWith(DB, 'coach-1', { placeId: 'p1', sessionToken: 'tok' });
});
