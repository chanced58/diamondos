/**
 * The practice runner. GET responds `PracticeRunResponse` (`@baseball/shared`).
 * POST applies one action - body `RunPracticeInput` without `practiceId`:
 * `start`, `complete`, `startBlock`, `skipBlock`, `completeBlock` - and
 * responds with the runner as it now stands. Coaches only.
 */
import { loadPracticeRun, runPractice } from '@/lib/services/practices/practice-run';
import { practiceBodyRoute, practiceReadRoute } from '@/lib/api/practice-route';

export const GET = practiceReadRoute(loadPracticeRun);
export const POST = practiceBodyRoute(runPractice);
