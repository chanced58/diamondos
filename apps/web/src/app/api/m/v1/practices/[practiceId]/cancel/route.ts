/** A coach cancels the practice. Body: `{ notifyTeam?, timeZone? }`. Responds `{ practiceId }`. */
import { cancelPractice } from '@/lib/services/practices/practices';
import { practiceBodyRoute } from '@/lib/api/practice-route';

export const POST = practiceBodyRoute(cancelPractice);
