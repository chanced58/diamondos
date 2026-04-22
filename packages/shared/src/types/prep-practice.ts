/**
 * Prep-practice generator types (Tier 6 F1).
 *
 * Output of generatePrepPractice() — a set of suggested practice blocks with
 * rationale. The UI renders these for coach review before persisting them
 * as practice_blocks.
 */

import type { PracticeBlockType } from './practice-template';
import type { HotHitter } from './hot-hitters';

export interface SuggestedBlock {
  /** Block order in the generated plan. */
  position: number;
  blockType: PracticeBlockType;
  /** Display title for the block (e.g., "Breaking-ball BP"). */
  title: string;
  plannedDurationMinutes: number;
  /** Drill selected by matchesDeficits() filter. May be null if no fit. */
  drillId?: string;
  /** Why this block was chosen — rendered as tooltip / expanded rationale. */
  rationale: string;
  /** Deficit ids driving this selection (subset of the input weakness mapping). */
  addressedDeficitIds: string[];
  /** Scouting tag values influencing this block (opponent-derived). */
  addressedTagValues: string[];
}

export interface PrepPracticeGeneration {
  blocks: SuggestedBlock[];
  /** Total of the planned durations — should approach the requested duration. */
  totalPlannedMinutes: number;
  /** Copy for the practices.prep_focus_summary column. */
  focusSummary: string;
  /** True when the generator had to leave blocks blank due to no matching drills. */
  hasGaps: boolean;
}

/** Payload the UI posts to create the practice from a generation. */
export interface PrepPracticePersistInput {
  teamId: string;
  linkedGameId: string;
  scheduledAt: string;
  durationMinutes: number;
  prepFocusSummary: string;
  blocks: SuggestedBlock[];
}

export type { HotHitter };
