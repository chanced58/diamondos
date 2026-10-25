/**
 * A coach saves the overall and coach notes, and the per-player notes sent.
 * Body: `SavePracticeNotesInput` without `practiceId`. Responds `{ practiceId }`.
 */
import { savePracticeNotes } from '@/lib/services/practices/practice-notes';
import { practiceBodyRoute } from '@/lib/api/practice-route';

export const PUT = practiceBodyRoute(savePracticeNotes);
