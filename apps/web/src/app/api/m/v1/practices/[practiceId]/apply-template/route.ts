/**
 * A head coach or athletic director replaces the practice's blocks with a
 * template's. Body: `{ templateId }`. Responds `{ practiceId }`.
 */
import { applyPracticeTemplate } from '@/lib/services/practices/practice-templates';
import { practiceBodyRoute } from '@/lib/api/practice-route';

/** See `applyPracticeTemplate`. */
export const POST = practiceBodyRoute(applyPracticeTemplate);
