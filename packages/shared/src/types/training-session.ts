/**
 * Tier 5 — Integration Hub
 *
 * Standalone sensor sessions (cage, bullpen) that are NOT tied to a game.
 * In-game sensor metrics live on `PitchThrownPayload` instead.
 *
 * Row shape mirrors public.training_sessions; the `metrics` column stores a
 * `TrainingSessionMetrics` variant selected by its `kind` discriminator.
 */

/** Stable vendor identifier used both as the DB `service` column and the
 *  discriminator prefix on metrics variants. */
export type TrainingSessionService =
  | 'rapsodo'
  | 'blast'
  | 'hittrax'
  | 'pocket_radar'
  | 'diamond_kinetics';

/** Rapsodo hitting session — a block of tracked swings. */
export interface RapsodoHittingMetrics {
  kind: 'rapsodo_hitting';
  swings: number;
  avgExitVelocity?: number;
  maxExitVelocity?: number;
  avgLaunchAngle?: number;
  avgDistance?: number;
}

/** Rapsodo pitching session — a block of tracked pitches. */
export interface RapsodoPitchingMetrics {
  kind: 'rapsodo_pitching';
  pitches: number;
  avgVelocity?: number;
  maxVelocity?: number;
  avgSpinRate?: number;
  avgExtension?: number;
}

/** Blast swing session — summary for a bat-sensor session. */
export interface BlastSwingMetrics {
  kind: 'blast_swing';
  swings: number;
  avgBatSpeed?: number;
  maxBatSpeed?: number;
  avgAttackAngle?: number;
  avgTimeToContact?: number;
}

/** HitTrax cage session — aggregated ball-flight numbers. */
export interface HittraxSessionMetrics {
  kind: 'hittrax_session';
  swings: number;
  avgExitVelocity?: number;
  maxExitVelocity?: number;
  avgDistance?: number;
  maxDistance?: number;
}

export type TrainingSessionMetrics =
  | RapsodoHittingMetrics
  | RapsodoPitchingMetrics
  | BlastSwingMetrics
  | HittraxSessionMetrics;

/** Shape of a row as persisted to public.training_sessions. The `metrics`
 *  payload is one of the variants above. */
export interface TrainingSession {
  id: string;
  teamId: string;
  playerId: string;
  service: TrainingSessionService;
  externalSessionId: string | null;
  occurredAt: string;
  metrics: TrainingSessionMetrics;
  importedBy: string | null;
  importedAt: string;
}

/** Insert shape: DB assigns `id`, `imported_at`; caller supplies the rest.
 *  `externalSessionId` nullable — hand-entered sessions are fine. */
export interface TrainingSessionInsert {
  teamId: string;
  playerId: string;
  service: TrainingSessionService;
  externalSessionId?: string | null;
  occurredAt: string;
  metrics: TrainingSessionMetrics;
  importedBy?: string | null;
}
