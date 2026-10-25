/** A player saves their own reflection. Body: `{ playerId, playerNotes }`. Responds `{ practiceId }`. */
import { savePracticeSelfNotes } from '@/lib/services/practices/practice-notes';
import { practiceBodyRoute } from '@/lib/api/practice-route';

export const PUT = practiceBodyRoute(savePracticeSelfNotes);
