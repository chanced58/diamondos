import { upsertPracticeAttendanceSchema } from '../practice-attendance';

const VALID = {
  practiceId: '00000000-0000-0000-0000-000000000001',
  playerId: '00000000-0000-0000-0000-000000000002',
};

describe('upsertPracticeAttendanceSchema', () => {
  it('accepts a minimal valid payload', () => {
    const result = upsertPracticeAttendanceSchema.safeParse({
      ...VALID,
      status: 'present',
    });
    expect(result.success).toBe(true);
  });

  it('accepts each valid status', () => {
    for (const status of ['present', 'absent', 'late', 'excused']) {
      const result = upsertPracticeAttendanceSchema.safeParse({ ...VALID, status });
      expect(result.success).toBe(true);
    }
  });

  it('rejects an unknown status', () => {
    const result = upsertPracticeAttendanceSchema.safeParse({ ...VALID, status: 'ghosted' });
    expect(result.success).toBe(false);
  });

  it('rejects notes longer than 500 chars', () => {
    const result = upsertPracticeAttendanceSchema.safeParse({
      ...VALID,
      status: 'excused',
      notes: 'x'.repeat(501),
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-uuid identifiers', () => {
    const result = upsertPracticeAttendanceSchema.safeParse({
      practiceId: 'not-a-uuid',
      playerId: VALID.playerId,
      status: 'present',
    });
    expect(result.success).toBe(false);
  });
});
