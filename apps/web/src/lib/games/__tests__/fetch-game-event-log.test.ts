import { fakeDb } from '../../services/__tests__/fake-db';
import { fetchGameEventLog } from '../fetch-game-event-log';

const row = (sequence: number) => ({ id: `e${sequence}`, sequence_number: sequence });

describe('fetchGameEventLog', () => {
  it('should read past the row cap in keyset pages until a short page', async () => {
    const { db, calls } = fakeDb({
      'game_events.select': [{ data: [row(1), row(2)] }, { data: [row(3), row(4)] }, { data: [row(5)] }],
    });

    const result = await fetchGameEventLog(db, 'g1', 2);

    expect(result).toEqual({ data: [row(1), row(2), row(3), row(4), row(5)], error: null });
    expect(calls.map((c) => c.filters['sequence_number>'])).toEqual([-1, 2, 4]);
    expect(calls.every((c) => c.filters.game_id === 'g1')).toBe(true);
  });

  it('should return the error rather than a partial log', async () => {
    const { db } = fakeDb({ 'game_events.select': [{ data: [row(1), row(2)] }, { error: { message: 'boom' } }] });
    expect(await fetchGameEventLog(db, 'g1', 2)).toEqual({ data: null, error: { message: 'boom' } });
  });

  it('should refuse a log still full at the page limit', async () => {
    let sequence = 0;
    const pages = Array.from({ length: 20 }, () => ({ data: [row(++sequence), row(++sequence)] }));
    const { db } = fakeDb({ 'game_events.select': pages });
    const result = await fetchGameEventLog(db, 'g1', 2);
    expect(result.data).toBeNull();
    expect(result.error?.message).toContain('more than 40 events');
  });
});
