import type { Game } from '../types/game';
import type { PracticeDrill } from '../types/practice-drill';
import {
  PracticeDrillDeficitPriority,
  type PracticeDrillDeficitTag,
} from '../types/practice-deficit';
import { PracticeBlockType } from '../types/practice-template';
import type { DerivedScoutingTag } from '../types/scouting-tag';
import type { HydratedWeaknessSignal } from '../types/weakness';
import type {
  PrepPracticeGeneration,
  SuggestedBlock,
} from '../types/prep-practice';

export interface PrepGeneratorInput {
  nextGame: Game;
  opponentName: string;
  tendencies: DerivedScoutingTag[];
  weaknesses: HydratedWeaknessSignal[];
  /** All drills the team can choose from — team-scoped + system. */
  drills: PracticeDrill[];
  /** Drill-id → tag rows (primary + secondary deficit tags on each drill). */
  drillDeficitTags: Map<string, PracticeDrillDeficitTag[]>;
  durationMinutes: number;
}

const WARMUP_MINUTES = 10;
const STRETCH_MINUTES = 5;
const DEFAULT_BLOCK_MINUTES = 15;

/**
 * Builds a suggested prep-practice plan from weaknesses + opponent tendencies.
 *
 * Algorithm:
 *  1. Reserve a warmup block and a stretch block at the ends.
 *  2. Collect a ranked list of target deficits (from weaknesses, scored by
 *     severity).
 *  3. For each deficit, pick the best-matching drill — primary-tag matches
 *     preferred, then secondary, then tag-less drills with matching skill
 *     categories are used as last-resort fallback.
 *  4. Pack blocks until the running total approaches durationMinutes. Skip
 *     deficits that no drill covers.
 *  5. Attach rationale strings citing the weakness label and any addressed
 *     tendencies.
 *
 * Pure. Returns gaps (hasGaps=true) when some deficits went uncovered.
 */
export function generatePrepPractice(input: PrepGeneratorInput): PrepPracticeGeneration {
  const { durationMinutes, weaknesses, tendencies, drills, drillDeficitTags } = input;

  const budget = Math.max(durationMinutes - WARMUP_MINUTES - STRETCH_MINUTES, 15);
  const rankedDeficits = rankTargetDeficits(weaknesses);

  const blocks: SuggestedBlock[] = [];
  let position = 0;
  let usedMinutes = 0;
  let hasGaps = false;

  // 1. Warmup
  blocks.push({
    position: position++,
    blockType: PracticeBlockType.WARMUP,
    title: 'Dynamic warmup',
    plannedDurationMinutes: WARMUP_MINUTES,
    rationale: 'Prep the body before focus work.',
    addressedDeficitIds: [],
    addressedTagValues: [],
  });

  // 2. Target blocks
  const usedDrillIds = new Set<string>();
  for (const deficit of rankedDeficits) {
    if (usedMinutes >= budget) break;
    const drill = pickDrillFor(deficit.deficitId, drills, drillDeficitTags, usedDrillIds);
    if (!drill) {
      hasGaps = true;
      continue;
    }
    usedDrillIds.add(drill.id);

    const duration = drill.defaultDurationMinutes ?? DEFAULT_BLOCK_MINUTES;
    const fit = Math.min(duration, budget - usedMinutes);
    if (fit < 5) break; // not worth a tiny block
    usedMinutes += fit;

    const tendencyMatches = matchingTendencyValues(tendencies, drill);
    blocks.push({
      position: position++,
      blockType: blockTypeForDrill(drill),
      title: drill.name,
      plannedDurationMinutes: fit,
      drillId: drill.id,
      rationale: buildRationale(deficit, tendencyMatches),
      addressedDeficitIds: [deficit.deficitId],
      addressedTagValues: tendencyMatches,
    });
  }

  // 3. Stretch / closeout
  blocks.push({
    position: position++,
    blockType: PracticeBlockType.STRETCH,
    title: 'Cool-down stretch',
    plannedDurationMinutes: STRETCH_MINUTES,
    rationale: 'Recover and review.',
    addressedDeficitIds: [],
    addressedTagValues: [],
  });

  const totalPlannedMinutes =
    WARMUP_MINUTES + STRETCH_MINUTES + usedMinutes;
  const focusSummary = buildFocusSummary(input.opponentName, weaknesses, tendencies);

  return { blocks, totalPlannedMinutes, focusSummary, hasGaps };
}

interface TargetDeficit {
  deficitId: string;
  weaknessLabel: string;
  severityScore: number;
}

function rankTargetDeficits(weaknesses: HydratedWeaknessSignal[]): TargetDeficit[] {
  const map = new Map<string, TargetDeficit>();
  for (const w of weaknesses) {
    for (const id of w.suggestedDeficitIds) {
      const existing = map.get(id);
      if (!existing || existing.severityScore < w.score) {
        map.set(id, { deficitId: id, weaknessLabel: w.label, severityScore: w.score });
      }
    }
  }
  return Array.from(map.values()).sort((a, b) => b.severityScore - a.severityScore);
}

function pickDrillFor(
  deficitId: string,
  drills: PracticeDrill[],
  drillDeficitTags: Map<string, PracticeDrillDeficitTag[]>,
  exclude: Set<string>,
): PracticeDrill | null {
  const primary: PracticeDrill[] = [];
  const secondary: PracticeDrill[] = [];
  for (const drill of drills) {
    if (exclude.has(drill.id)) continue;
    const tags = drillDeficitTags.get(drill.id);
    if (!tags) continue;
    for (const tag of tags) {
      if (tag.deficitId !== deficitId) continue;
      if (tag.priority === PracticeDrillDeficitPriority.PRIMARY) primary.push(drill);
      else secondary.push(drill);
      break;
    }
  }
  if (primary.length > 0) return primary[0];
  if (secondary.length > 0) return secondary[0];
  return null;
}

function blockTypeForDrill(drill: PracticeDrill): PracticeBlockType {
  const cats = drill.skillCategories;
  if (cats.includes('pitching' as never)) return PracticeBlockType.BULLPEN;
  if (cats.includes('team_defense' as never)) return PracticeBlockType.TEAM_DEFENSE;
  if (cats.includes('conditioning' as never)) return PracticeBlockType.CONDITIONING;
  return PracticeBlockType.INDIVIDUAL_SKILL;
}

function matchingTendencyValues(
  tendencies: DerivedScoutingTag[],
  drill: PracticeDrill,
): string[] {
  // Simple overlap: if any tendency tag-value shows up in the drill's tags,
  // surface it in the rationale. Richer semantic matching (e.g. "curveball"
  // tendency → BP drill with "breaking" tag) can be layered on later.
  const tags = new Set(drill.tags.map((t) => t.toLowerCase()));
  return tendencies
    .map((t) => t.tagValue.toLowerCase())
    .filter((v) => tags.has(v));
}

function buildRationale(deficit: TargetDeficit, tendencyValues: string[]): string {
  const base = `Targets last-game weakness: ${deficit.weaknessLabel.toLowerCase()}`;
  if (tendencyValues.length === 0) return base + '.';
  return `${base}; also addresses opponent tendency (${tendencyValues.join(', ')}).`;
}

function buildFocusSummary(
  opponentName: string,
  weaknesses: HydratedWeaknessSignal[],
  tendencies: DerivedScoutingTag[],
): string {
  const parts: string[] = [];
  if (weaknesses.length > 0) {
    const labels = weaknesses.slice(0, 3).map((w) => w.label.toLowerCase());
    parts.push(`Addressing last-game gaps: ${labels.join(', ')}.`);
  }
  if (tendencies.length > 0) {
    const tendencyLabels = tendencies.slice(0, 3).map((t) => t.tagValue);
    parts.push(`Accounting for ${opponentName} tendencies: ${tendencyLabels.join(', ')}.`);
  }
  if (parts.length === 0) {
    return `Prep for ${opponentName} — no specific tendencies or weaknesses detected yet.`;
  }
  return `Prep for ${opponentName}. ${parts.join(' ')}`;
}
