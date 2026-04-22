import type { PracticeFieldSpace } from './practice-drill';
import type { PracticeBlockType } from './practice-template';

export enum PracticeWeatherMode {
  OUTDOOR = 'outdoor',
  INDOOR_GYM = 'indoor_gym',
  CLASSROOM = 'classroom',
  CANCELLED = 'cancelled',
}

export enum PracticeRunStatus {
  NOT_STARTED = 'not_started',
  RUNNING = 'running',
  COMPLETED = 'completed',
}

export enum PracticeBlockStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  COMPLETED = 'completed',
  SKIPPED = 'skipped',
}

export interface PracticeBlock {
  id: string;
  practiceId: string;
  position: number;
  blockType: PracticeBlockType;
  title: string;
  plannedDurationMinutes: number;
  actualDurationMinutes?: number;
  drillId?: string;
  assignedCoachId?: string;
  fieldSpaces: PracticeFieldSpace[];
  notes?: string;
  status: PracticeBlockStatus;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PracticeBlockPlayer {
  id: string;
  blockId: string;
  playerId: string;
  rotationGroup?: number;
  createdAt: string;
}

export interface PracticeStation {
  id: string;
  blockId: string;
  position: number;
  name: string;
  drillId?: string;
  coachId?: string;
  fieldSpace?: PracticeFieldSpace;
  rotationDurationMinutes: number;
  rotationCount: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PracticeStationAssignment {
  id: string;
  stationId: string;
  playerId: string;
  rotationIndex: number;
  createdAt: string;
}

export interface FieldSpaceConflict {
  fieldSpace: PracticeFieldSpace;
  overlappingBlocks: Array<{
    blockId: string;
    title: string;
    startsAt: string;
    endsAt: string;
  }>;
}

export interface ScheduledBlock {
  blockId: string;
  startsAt: string;
  endsAt: string;
}

export interface PracticeWithBlocks {
  id: string;
  teamId: string;
  scheduledAt: string;
  durationMinutes?: number;
  location?: string;
  templateId?: string;
  indoorTemplateId?: string;
  weatherMode: PracticeWeatherMode;
  runStatus: PracticeRunStatus;
  startedAt?: string;
  completedAt?: string;
  activeBlockId?: string;
  totalPlannedMinutes: number;
  isQuickPractice: boolean;
  status: string;
  plan?: string;
  /** Optional Tier 6 link: the upcoming game this practice is prepping for. */
  linkedGameId?: string;
  /** Tier 6 rationale shown on the plan header when linkedGameId is set. */
  prepFocusSummary?: string;
  blocks: Array<PracticeBlock & {
    players: PracticeBlockPlayer[];
    stations: Array<PracticeStation & { assignments: PracticeStationAssignment[] }>;
  }>;
}
