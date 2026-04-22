export type PracticeAttendanceStatus = 'present' | 'absent' | 'late' | 'excused';

export const PRACTICE_ATTENDANCE_STATUSES: readonly PracticeAttendanceStatus[] = [
  'present',
  'absent',
  'late',
  'excused',
] as const;

export type PracticeNotificationKind = 'pre_practice';

export interface PracticeAttendance {
  id: string;
  practiceId: string;
  playerId: string;
  status: PracticeAttendanceStatus;
  checkedInAt: string | null;
  checkedInBy: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}
