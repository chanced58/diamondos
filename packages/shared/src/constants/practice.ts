import {
  PracticeAgeLevel,
  PracticeEquipment,
  PracticeFieldSpace,
  PracticeSkillCategory,
} from '../types/practice-drill';
import {
  PracticeBlockType,
  PracticeSeasonPhase,
  PracticeTemplateKind,
} from '../types/practice-template';
import { PracticeWeatherMode } from '../types/practice';

export const SKILL_CATEGORY_LABELS: Record<PracticeSkillCategory, string> = {
  [PracticeSkillCategory.HITTING]: 'Hitting',
  [PracticeSkillCategory.PITCHING]: 'Pitching',
  [PracticeSkillCategory.FIELDING]: 'Fielding',
  [PracticeSkillCategory.BASERUNNING]: 'Baserunning',
  [PracticeSkillCategory.TEAM_DEFENSE]: 'Team Defense',
  [PracticeSkillCategory.CONDITIONING]: 'Conditioning',
  [PracticeSkillCategory.AGILITY]: 'Agility',
  [PracticeSkillCategory.MENTAL]: 'Mental',
};

export const EQUIPMENT_LABELS: Record<PracticeEquipment, string> = {
  [PracticeEquipment.BASEBALLS]: 'Baseballs',
  [PracticeEquipment.TEES]: 'Tees',
  [PracticeEquipment.NETS]: 'Nets',
  [PracticeEquipment.CONES]: 'Cones',
  [PracticeEquipment.BASES]: 'Bases',
  [PracticeEquipment.CATCHERS_GEAR]: "Catcher's gear",
  [PracticeEquipment.RADAR_GUN]: 'Radar gun',
  [PracticeEquipment.PITCHING_MACHINE]: 'Pitching machine',
  [PracticeEquipment.L_SCREEN]: 'L-screen',
  [PracticeEquipment.WEIGHTS]: 'Weights',
  [PracticeEquipment.AGILITY_LADDER]: 'Agility ladder',
  [PracticeEquipment.MEDICINE_BALL]: 'Medicine ball',
  [PracticeEquipment.BAT]: 'Bat',
  [PracticeEquipment.HELMET]: 'Helmet',
  [PracticeEquipment.NONE]: 'No equipment',
};

export const FIELD_SPACE_LABELS: Record<PracticeFieldSpace, string> = {
  [PracticeFieldSpace.FULL_FIELD]: 'Full field',
  [PracticeFieldSpace.INFIELD]: 'Infield',
  [PracticeFieldSpace.OUTFIELD]: 'Outfield',
  [PracticeFieldSpace.CAGE_1]: 'Cage 1',
  [PracticeFieldSpace.CAGE_2]: 'Cage 2',
  [PracticeFieldSpace.BULLPEN_1]: 'Bullpen 1',
  [PracticeFieldSpace.BULLPEN_2]: 'Bullpen 2',
  [PracticeFieldSpace.GYM]: 'Gym',
  [PracticeFieldSpace.CLASSROOM]: 'Classroom',
  [PracticeFieldSpace.OPEN_SPACE]: 'Open space',
};

export const AGE_LEVEL_LABELS: Record<PracticeAgeLevel, string> = {
  [PracticeAgeLevel.U8]: '8U',
  [PracticeAgeLevel.U10]: '10U',
  [PracticeAgeLevel.U12]: '12U',
  [PracticeAgeLevel.U14]: '14U',
  [PracticeAgeLevel.HIGH_SCHOOL_JV]: 'HS JV',
  [PracticeAgeLevel.HIGH_SCHOOL_VARSITY]: 'HS Varsity',
  [PracticeAgeLevel.COLLEGE]: 'College',
  [PracticeAgeLevel.ADULT]: 'Adult',
  [PracticeAgeLevel.ALL]: 'All ages',
};

export const BLOCK_TYPE_LABELS: Record<PracticeBlockType, string> = {
  [PracticeBlockType.WARMUP]: 'Warmup',
  [PracticeBlockType.INDIVIDUAL_SKILL]: 'Individual skill',
  [PracticeBlockType.TEAM_DEFENSE]: 'Team defense',
  [PracticeBlockType.SITUATIONAL]: 'Situational',
  [PracticeBlockType.CONDITIONING]: 'Conditioning',
  [PracticeBlockType.BULLPEN]: 'Bullpen',
  [PracticeBlockType.SCRIMMAGE]: 'Scrimmage',
  [PracticeBlockType.STRETCH]: 'Stretch',
  [PracticeBlockType.MEETING]: 'Team meeting',
  [PracticeBlockType.WATER_BREAK]: 'Water break',
  [PracticeBlockType.CUSTOM]: 'Custom',
};

/**
 * Tailwind color tokens (no class prefix) used on timeline bars and badges.
 * Consumers combine with their own prefix (`bg-`, `text-`, `border-`, etc.).
 */
export const BLOCK_TYPE_COLORS: Record<PracticeBlockType, string> = {
  [PracticeBlockType.WARMUP]: 'sky-500',
  [PracticeBlockType.INDIVIDUAL_SKILL]: 'indigo-500',
  [PracticeBlockType.TEAM_DEFENSE]: 'emerald-600',
  [PracticeBlockType.SITUATIONAL]: 'amber-500',
  [PracticeBlockType.CONDITIONING]: 'rose-500',
  [PracticeBlockType.BULLPEN]: 'violet-500',
  [PracticeBlockType.SCRIMMAGE]: 'orange-500',
  [PracticeBlockType.STRETCH]: 'teal-500',
  [PracticeBlockType.MEETING]: 'slate-500',
  [PracticeBlockType.WATER_BREAK]: 'cyan-500',
  [PracticeBlockType.CUSTOM]: 'zinc-500',
};

export const TEMPLATE_KIND_LABELS: Record<PracticeTemplateKind, string> = {
  [PracticeTemplateKind.WEEKLY_RECURRING]: 'Weekly recurring',
  [PracticeTemplateKind.SEASONAL]: 'Seasonal',
  [PracticeTemplateKind.QUICK_90]: 'Quick 90-minute',
  [PracticeTemplateKind.CUSTOM]: 'Custom',
};

export const SEASON_PHASE_LABELS: Record<PracticeSeasonPhase, string> = {
  [PracticeSeasonPhase.PRESEASON]: 'Preseason',
  [PracticeSeasonPhase.IN_SEASON]: 'In season',
  [PracticeSeasonPhase.PLAYOFF]: 'Playoff',
  [PracticeSeasonPhase.OFFSEASON]: 'Offseason',
  [PracticeSeasonPhase.ANY]: 'Any',
};

export const WEATHER_MODE_LABELS: Record<PracticeWeatherMode, string> = {
  [PracticeWeatherMode.OUTDOOR]: 'Outdoor',
  [PracticeWeatherMode.INDOOR_GYM]: 'Indoor / gym',
  [PracticeWeatherMode.CLASSROOM]: 'Classroom',
  [PracticeWeatherMode.CANCELLED]: 'Cancelled',
};

export const QUICK_PRACTICE_DEFAULT_DURATION = 90;
export const DEFAULT_ROTATION_DURATION_MINUTES = 10;

/**
 * Default 90-minute rainout fallback used when a coach picks "Quick 90".
 * Order matters — stored as-is into practice_template_blocks.
 */
export const QUICK_PRACTICE_BLOCK_TEMPLATE: Array<{
  blockType: PracticeBlockType;
  title: string;
  durationMinutes: number;
}> = [
  { blockType: PracticeBlockType.WARMUP, title: 'Warmup + catch play', durationMinutes: 10 },
  { blockType: PracticeBlockType.INDIVIDUAL_SKILL, title: 'Individual skills', durationMinutes: 20 },
  { blockType: PracticeBlockType.TEAM_DEFENSE, title: 'Team defense', durationMinutes: 25 },
  { blockType: PracticeBlockType.SITUATIONAL, title: 'Situational', durationMinutes: 20 },
  { blockType: PracticeBlockType.CONDITIONING, title: 'Conditioning', durationMinutes: 10 },
  { blockType: PracticeBlockType.STRETCH, title: 'Cooldown', durationMinutes: 5 },
];

/**
 * full_field is treated as exclusive with infield and outfield during conflict
 * detection — any block that reserves the full field collides with concurrent
 * blocks needing just the IF or OF.
 */
export const FULL_FIELD_SUBSUMES: Partial<
  Record<PracticeFieldSpace, readonly PracticeFieldSpace[]>
> = {
  [PracticeFieldSpace.FULL_FIELD]: [
    PracticeFieldSpace.INFIELD,
    PracticeFieldSpace.OUTFIELD,
  ],
};
