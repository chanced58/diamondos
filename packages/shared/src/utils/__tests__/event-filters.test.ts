import { applyPitchReverted } from '../event-filters';

/**
 * event_voided removal is keyed on the voided event's id, but mobile's
 * line-score rows are built without an `id` column. The filter must fall back
 * to `voidedSequenceNumber` so voided plays are still removed from downstream
 * consumers (line score, mercy/run-cap advisories).
 */
describe('applyPitchReverted — event_voided matching', () => {
  it('removes a voided event by id', () => {
    const rows = [
      { id: 'e1', event_type: 'hit', sequence_number: 1, payload: {} },
      { id: 'e2', event_type: 'out', sequence_number: 2, payload: {} },
      { id: 'v1', event_type: 'event_voided', sequence_number: 3, payload: { voidedEventId: 'e2' } },
    ];
    const result = applyPitchReverted(rows);
    expect(result.map((r) => r.id)).toEqual(['e1']);
  });

  it('falls back to voidedSequenceNumber when the rows carry no id', () => {
    // Mobile line-score rows omit id — only the sequence number is present.
    const rows = [
      { event_type: 'hit', sequence_number: 1, payload: {} },
      { event_type: 'out', sequence_number: 2, payload: {} },
      { event_type: 'event_voided', sequence_number: 3, payload: { voidedSequenceNumber: 2 } },
    ];
    const result = applyPitchReverted(rows);
    expect(result.map((r) => r.sequence_number)).toEqual([1]);
  });

  it('leaves rows untouched when neither id nor sequence matches', () => {
    const rows = [
      { event_type: 'hit', sequence_number: 1, payload: {} },
      { event_type: 'event_voided', sequence_number: 2, payload: { voidedSequenceNumber: 99 } },
    ];
    const result = applyPitchReverted(rows);
    expect(result.map((r) => r.sequence_number)).toEqual([1]);
  });
});
