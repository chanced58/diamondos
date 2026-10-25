/** A coach logs one BP rep. Body: `{ playerId, outcome, coachTag? }`. Responds `{ practiceId }`. */
import { logPracticeRep } from '@/lib/services/practices/practice-notes';
import { practiceBodyRoute } from '@/lib/api/practice-route';

/** Logs one rep; see `logPracticeRep`. */
export const POST = practiceBodyRoute(logPracticeRep);
