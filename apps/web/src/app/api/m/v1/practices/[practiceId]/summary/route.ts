/**
 * The AI post-practice summary. GET responds `PracticeSummaryResponse`
 * (`@baseball/shared`), `summary: null` before one is generated; POST
 * generates (or regenerates) it, waiting on the model. Coaches only.
 */
import { generatePracticeSummary, loadPracticeSummary } from '@/lib/services/practices/practice-summary';
import { practiceBodyRoute, practiceReadRoute } from '@/lib/api/practice-route';

/** The saved summary; see `loadPracticeSummary`. */
export const GET = practiceReadRoute(loadPracticeSummary);
/** Generates it; see `generatePracticeSummary`. */
export const POST = practiceBodyRoute(generatePracticeSummary);
