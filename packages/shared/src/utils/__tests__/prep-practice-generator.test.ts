import { GameLocationType, GameStatus, type Game } from '../../types/game';
import {
  PracticeAgeLevel,
  PracticeDrillVisibility,
  PracticeSkillCategory,
  type PracticeDrill,
} from '../../types/practice-drill';
import {
  PracticeDrillDeficitPriority,
  type PracticeDrillDeficitTag,
} from '../../types/practice-deficit';
import { PracticeBlockType } from '../../types/practice-template';
import {
  WeaknessCode,
  WeaknessSeverity,
  type HydratedWeaknessSignal,
} from '../../types/weakness';
import { generatePrepPractice } from '../prep-practice-generator';

function drill(overrides: Partial<PracticeDrill> & { id: string; name: string }): PracticeDrill {
  return {
    teamId: null,
    visibility: PracticeDrillVisibility.SYSTEM,
    description: '',
    defaultDurationMinutes: 15,
    skillCategories: [PracticeSkillCategory.HITTING],
    positions: [],
    ageLevels: [PracticeAgeLevel.ALL],
    equipment: [],
    fieldSpaces: [],
    tags: [],
    createdAt: '2026-04-01T00:00:00Z',
    updatedAt: '2026-04-01T00:00:00Z',
    ...overrides,
  };
}

function tag(
  drillId: string,
  deficitId: string,
  priority: PracticeDrillDeficitPriority = PracticeDrillDeficitPriority.PRIMARY,
): PracticeDrillDeficitTag {
  return {
    id: `tag-${drillId}-${deficitId}`,
    drillId,
    deficitId,
    teamId: null,
    priority,
    createdAt: '2026-04-01T00:00:00Z',
  };
}

function weakness(
  code: WeaknessCode,
  label: string,
  score: number,
  deficitIds: string[],
): HydratedWeaknessSignal {
  return {
    code,
    label,
    description: `${label} description`,
    severity: WeaknessSeverity.MEDIUM,
    score,
    evidence: { metric: 'test', value: 1 },
    suggestedDeficitSlugs: [],
    suggestedDeficitIds: deficitIds,
  };
}

const NEXT_GAME: Game = {
  id: 'g-next',
  seasonId: 'season-1',
  teamId: 'team-1',
  opponentName: 'Eastside HS',
  scheduledAt: '2026-04-25T18:00:00Z',
  locationType: GameLocationType.AWAY,
  status: GameStatus.SCHEDULED,
  homeScore: 0,
  awayScore: 0,
  currentInning: 1,
  isTopOfInning: true,
  outs: 0,
  createdBy: 'u-1',
  createdAt: '2026-04-01T00:00:00Z',
  updatedAt: '2026-04-01T00:00:00Z',
};

describe('generatePrepPractice', () => {
  it('always includes warmup + stretch blocks', () => {
    const result = generatePrepPractice({
      nextGame: NEXT_GAME,
      opponentName: NEXT_GAME.opponentName ?? '',
      tendencies: [],
      weaknesses: [],
      drills: [],
      drillDeficitTags: new Map(),
      durationMinutes: 60,
    });
    expect(result.blocks[0].blockType).toBe(PracticeBlockType.WARMUP);
    expect(result.blocks[result.blocks.length - 1].blockType).toBe(PracticeBlockType.STRETCH);
  });

  it('picks primary-tagged drills before secondary', () => {
    const drills = [
      drill({ id: 'd-primary', name: 'Primary Drill' }),
      drill({ id: 'd-secondary', name: 'Secondary Drill' }),
    ];
    const tags = new Map<string, PracticeDrillDeficitTag[]>();
    tags.set('d-primary', [tag('d-primary', 'def-1', PracticeDrillDeficitPriority.PRIMARY)]);
    tags.set('d-secondary', [tag('d-secondary', 'def-1', PracticeDrillDeficitPriority.SECONDARY)]);

    const result = generatePrepPractice({
      nextGame: NEXT_GAME,
      opponentName: NEXT_GAME.opponentName ?? '',
      tendencies: [],
      weaknesses: [weakness(WeaknessCode.K_VS_OFFSPEED, 'Ks on off-speed', 0.8, ['def-1'])],
      drills,
      drillDeficitTags: tags,
      durationMinutes: 60,
    });
    const targetBlock = result.blocks.find((b) => b.drillId);
    expect(targetBlock?.drillId).toBe('d-primary');
  });

  it('falls back to secondary when no primary is available', () => {
    const drills = [drill({ id: 'd-secondary', name: 'Secondary Drill' })];
    const tags = new Map<string, PracticeDrillDeficitTag[]>();
    tags.set('d-secondary', [
      tag('d-secondary', 'def-1', PracticeDrillDeficitPriority.SECONDARY),
    ]);

    const result = generatePrepPractice({
      nextGame: NEXT_GAME,
      opponentName: NEXT_GAME.opponentName ?? '',
      tendencies: [],
      weaknesses: [weakness(WeaknessCode.RISP_FAILURE, 'RISP', 0.7, ['def-1'])],
      drills,
      drillDeficitTags: tags,
      durationMinutes: 60,
    });
    const targetBlock = result.blocks.find((b) => b.drillId);
    expect(targetBlock?.drillId).toBe('d-secondary');
  });

  it('reports hasGaps=true when weaknesses have no matching drill', () => {
    const result = generatePrepPractice({
      nextGame: NEXT_GAME,
      opponentName: NEXT_GAME.opponentName ?? '',
      tendencies: [],
      weaknesses: [weakness(WeaknessCode.K_VS_OFFSPEED, 'Ks', 0.8, ['nonexistent'])],
      drills: [],
      drillDeficitTags: new Map(),
      durationMinutes: 60,
    });
    expect(result.hasGaps).toBe(true);
  });

  it('ranks deficits by weakness severity score', () => {
    const drills = [
      drill({ id: 'd-high', name: 'High Drill' }),
      drill({ id: 'd-low', name: 'Low Drill' }),
    ];
    const tags = new Map<string, PracticeDrillDeficitTag[]>();
    tags.set('d-high', [tag('d-high', 'def-high')]);
    tags.set('d-low', [tag('d-low', 'def-low')]);

    const result = generatePrepPractice({
      nextGame: NEXT_GAME,
      opponentName: NEXT_GAME.opponentName ?? '',
      tendencies: [],
      weaknesses: [
        weakness(WeaknessCode.WALKS_ISSUED, 'Low', 0.3, ['def-low']),
        weakness(WeaknessCode.RISP_FAILURE, 'High', 0.9, ['def-high']),
      ],
      drills,
      drillDeficitTags: tags,
      durationMinutes: 60,
    });
    const targetBlocks = result.blocks.filter((b) => b.drillId);
    expect(targetBlocks[0].drillId).toBe('d-high');
    expect(targetBlocks[1].drillId).toBe('d-low');
  });

  it('builds a focus summary mentioning opponent + weaknesses', () => {
    const result = generatePrepPractice({
      nextGame: NEXT_GAME,
      opponentName: 'Eastside HS',
      tendencies: [],
      weaknesses: [weakness(WeaknessCode.K_VS_OFFSPEED, 'Ks on off-speed', 0.8, ['def-1'])],
      drills: [],
      drillDeficitTags: new Map(),
      durationMinutes: 60,
    });
    expect(result.focusSummary.toLowerCase()).toContain('eastside hs');
    expect(result.focusSummary.toLowerCase()).toContain('ks on off-speed');
  });

  it('does not exceed the requested duration budget, even with more matching drills than fit', () => {
    // Each drill is tagged with its OWN deficit (def-0..def-9), and each
    // weakness suggests the matching deficit — so the generator can choose
    // from 10 distinct matches and must stop when the budget fills.
    const drills = Array.from({ length: 10 }, (_, i) =>
      drill({ id: `d-${i}`, name: `Drill ${i}`, defaultDurationMinutes: 20 }),
    );
    const tags = new Map<string, PracticeDrillDeficitTag[]>();
    drills.forEach((d, i) => tags.set(d.id, [tag(d.id, `def-${i}`)]));

    const result = generatePrepPractice({
      nextGame: NEXT_GAME,
      opponentName: NEXT_GAME.opponentName ?? '',
      tendencies: [],
      weaknesses: Array.from({ length: 10 }, (_, i) =>
        weakness(WeaknessCode.K_VS_OFFSPEED, 'Ks', 0.9 - i * 0.05, [`def-${i}`]),
      ),
      drills,
      drillDeficitTags: tags,
      durationMinutes: 60,
    });
    expect(result.totalPlannedMinutes).toBeLessThanOrEqual(60);
    // 10 drills available, but only a 45-min drill budget (60 minus 10 warmup
    // + 5 stretch). The generator must stop well before exhausting the list.
    const drillBlocks = result.blocks.filter((b) => b.drillId);
    expect(drillBlocks.length).toBeLessThan(drills.length);
    expect(drillBlocks.length).toBeGreaterThanOrEqual(1);
  });
});
