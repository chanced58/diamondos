/**
 * Drill library types. Mirror the Postgres enums defined in
 * supabase/migrations/20260421000001_practice_enums.sql.
 *
 * String values MUST match the DB enum labels exactly so that values
 * round-trip through Supabase without mapping.
 */

export enum PracticeSkillCategory {
  HITTING = 'hitting',
  PITCHING = 'pitching',
  FIELDING = 'fielding',
  BASERUNNING = 'baserunning',
  TEAM_DEFENSE = 'team_defense',
  CONDITIONING = 'conditioning',
  AGILITY = 'agility',
  MENTAL = 'mental',
}

export enum PracticeEquipment {
  BASEBALLS = 'baseballs',
  TEES = 'tees',
  NETS = 'nets',
  CONES = 'cones',
  BASES = 'bases',
  CATCHERS_GEAR = 'catchers_gear',
  RADAR_GUN = 'radar_gun',
  PITCHING_MACHINE = 'pitching_machine',
  L_SCREEN = 'l_screen',
  WEIGHTS = 'weights',
  AGILITY_LADDER = 'agility_ladder',
  MEDICINE_BALL = 'medicine_ball',
  BAT = 'bat',
  HELMET = 'helmet',
  NONE = 'none',
}

export enum PracticeFieldSpace {
  FULL_FIELD = 'full_field',
  INFIELD = 'infield',
  OUTFIELD = 'outfield',
  CAGE_1 = 'cage_1',
  CAGE_2 = 'cage_2',
  BULLPEN_1 = 'bullpen_1',
  BULLPEN_2 = 'bullpen_2',
  GYM = 'gym',
  CLASSROOM = 'classroom',
  OPEN_SPACE = 'open_space',
}

export enum PracticeAgeLevel {
  U8 = '8u',
  U10 = '10u',
  U12 = '12u',
  U14 = '14u',
  HIGH_SCHOOL_JV = 'high_school_jv',
  HIGH_SCHOOL_VARSITY = 'high_school_varsity',
  COLLEGE = 'college',
  ADULT = 'adult',
  ALL = 'all',
}

export enum PracticeDrillVisibility {
  SYSTEM = 'system',
  TEAM = 'team',
}

export interface PracticeDrill {
  id: string;
  /** null for visibility='system'; owning team id otherwise. */
  teamId: string | null;
  visibility: PracticeDrillVisibility;
  name: string;
  description?: string;
  defaultDurationMinutes?: number;
  skillCategories: PracticeSkillCategory[];
  /** Position abbreviations (e.g. '1B', 'SS', 'CF'). Empty means any position. */
  positions: string[];
  ageLevels: PracticeAgeLevel[];
  equipment: PracticeEquipment[];
  fieldSpaces: PracticeFieldSpace[];
  minPlayers?: number;
  maxPlayers?: number;
  coachingPoints?: string;
  tags: string[];
  diagramUrl?: string;
  videoUrl?: string;
  source?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export type PracticeDrillAttachmentKind = 'video' | 'diagram' | 'pdf' | 'image';

export interface PracticeDrillAttachment {
  id: string;
  drillId: string;
  storagePath: string;
  mimeType: string;
  kind: PracticeDrillAttachmentKind;
  sizeBytes?: number;
  uploadedBy?: string;
  createdAt: string;
}

export interface DrillFilters {
  skillCategories?: PracticeSkillCategory[];
  positions?: string[];
  ageLevels?: PracticeAgeLevel[];
  equipment?: PracticeEquipment[];
  fieldSpaces?: PracticeFieldSpace[];
  search?: string;
  minPlayers?: number;
  maxPlayers?: number;
  durationMax?: number;
  visibility?: 'system' | 'team' | 'all';
}
