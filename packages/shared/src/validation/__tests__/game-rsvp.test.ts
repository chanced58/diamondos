import { upsertGameRsvpSchema } from '../game-rsvp';

const VALID = {
  gameId: '00000000-0000-0000-0000-000000000001',
  playerId: '00000000-0000-0000-0000-000000000002',
};

describe('upsertGameRsvpSchema', () => {
  it('accepts a minimal valid payload', () => {
    const result = upsertGameRsvpSchema.safeParse({ ...VALID, status: 'attending' });
    expect(result.success).toBe(true);
  });

  it('accepts each valid status', () => {
    for (const status of ['attending', 'not_attending', 'maybe']) {
      const result = upsertGameRsvpSchema.safeParse({ ...VALID, status });
      expect(result.success).toBe(true);
    }
  });

  it('rejects an unknown status', () => {
    const result = upsertGameRsvpSchema.safeParse({ ...VALID, status: 'undecided' });
    expect(result.success).toBe(false);
  });

  it('rejects notes longer than 200 chars', () => {
    const result = upsertGameRsvpSchema.safeParse({
      ...VALID,
      status: 'maybe',
      note: 'x'.repeat(201),
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-uuid identifiers', () => {
    const result = upsertGameRsvpSchema.safeParse({
      gameId: 'not-a-uuid',
      playerId: VALID.playerId,
      status: 'attending',
    });
    expect(result.success).toBe(false);
  });
});
