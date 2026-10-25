/**
 * A practice as its page shows it to the caller: coaches get their notes,
 * every player's notes, the roster and the hot/cold hitters; a player their
 * own notes; a parent each linked child's. Responds `PracticeDetailResponse`
 * (`@baseball/shared`); 404 for anyone off the team.
 */
import { loadPractice } from '@/lib/services/practices/load-practice';
import { practiceReadRoute } from '@/lib/api/practice-route';

export const GET = practiceReadRoute(loadPractice);
