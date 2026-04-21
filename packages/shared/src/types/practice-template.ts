import type { PracticeFieldSpace } from './practice-drill';

export enum PracticeBlockType {
  WARMUP = 'warmup',
  INDIVIDUAL_SKILL = 'individual_skill',
  TEAM_DEFENSE = 'team_defense',
  SITUATIONAL = 'situational',
  CONDITIONING = 'conditioning',
  BULLPEN = 'bullpen',
  SCRIMMAGE = 'scrimmage',
  STRETCH = 'stretch',
  MEETING = 'meeting',
  WATER_BREAK = 'water_break',
  CUSTOM = 'custom',
}

export enum PracticeTemplateKind {
  WEEKLY_RECURRING = 'weekly_recurring',
  SEASONAL = 'seasonal',
  QUICK_90 = 'quick_90',
  CUSTOM = 'custom',
}

export enum PracticeSeasonPhase {
  PRESEASON = 'preseason',
  IN_SEASON = 'in_season',
  PLAYOFF = 'playoff',
  OFFSEASON = 'offseason',
  ANY = 'any',
}

export interface PracticeTemplate {
  id: string;
  teamId: string;
  name: string;
  description?: string;
  kind: PracticeTemplateKind;
  seasonPhase: PracticeSeasonPhase;
  defaultDurationMinutes: number;
  isIndoorFallback: boolean;
  /** If this is an outdoor template paired with an indoor fallback, points at it. */
  pairedTemplateId?: string;
  archivedAt?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface PracticeTemplateBlock {
  id: string;
  templateId: string;
  position: number;
  blockType: PracticeBlockType;
  title: string;
  durationMinutes: number;
  drillId?: string;
  fieldSpaces: PracticeFieldSpace[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PracticeTemplateWithBlocks extends PracticeTemplate {
  blocks: PracticeTemplateBlock[];
}
