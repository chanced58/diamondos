/** A coach saves the practice's plan text. Body: `{ plan }`. Responds `{ practiceId }`. */
import { savePracticePlan } from '@/lib/services/practices/practice-notes';
import { practiceBodyRoute } from '@/lib/api/practice-route';

/** Saves the plan text; see `savePracticePlan`. */
export const PATCH = practiceBodyRoute(savePracticePlan);
