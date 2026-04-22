import { z } from 'zod';
import { PRACTICE_ATTENDANCE_STATUSES } from '../types/practice-attendance';

export const practiceAttendanceStatusSchema = z.enum(
  PRACTICE_ATTENDANCE_STATUSES as unknown as [string, ...string[]],
);

export const upsertPracticeAttendanceSchema = z.object({
  practiceId: z.string().uuid(),
  playerId: z.string().uuid(),
  status: practiceAttendanceStatusSchema,
  notes: z.string().max(500).optional(),
});

export type UpsertPracticeAttendanceInput = z.infer<typeof upsertPracticeAttendanceSchema>;
