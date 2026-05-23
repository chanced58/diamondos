import type { TrainingModule } from './types';
import { gettingStarted } from './modules/getting-started';
import { rosterAndLineups } from './modules/roster-and-lineups';
import { scoringAGame } from './modules/scoring-a-game';
import { pitchCountCompliance } from './modules/pitch-count-compliance';
import { messagingBasics } from './modules/messaging-basics';

export const CURRICULUM_VERSION = '2026-05-23';

export const TRAINING_MODULES: readonly TrainingModule[] = [
  gettingStarted,
  rosterAndLineups,
  scoringAGame,
  pitchCountCompliance,
  messagingBasics,
];

export function getModuleBySlug(slug: string): TrainingModule | undefined {
  return TRAINING_MODULES.find((m) => m.slug === slug);
}

export function isCurriculumComplete(completedSlugs: readonly string[]): boolean {
  const set = new Set(completedSlugs);
  return TRAINING_MODULES.every((m) => set.has(m.slug));
}

export function nextIncompleteSlug(
  completedSlugs: readonly string[],
): string | null {
  const set = new Set(completedSlugs);
  const next = TRAINING_MODULES.find((m) => !set.has(m.slug));
  return next?.slug ?? null;
}
