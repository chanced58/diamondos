import { z } from 'zod';

const RiskLevel = z.enum(['low', 'medium', 'high']);

export const AiHitterProfileSchema = z.object({
  opponentPlayerId: z.string().uuid(),
  approach: z.string().min(1).max(500),
  howToPitchThem: z.string().min(1).max(500),
  stealRisk: RiskLevel,
  buntRisk: RiskLevel,
  /** 1–9 Strike-zone cells where this hitter has shown success. */
  hotZones: z.array(z.number().int().min(1).max(9)).max(9),
  /** 1–9 Strike-zone cells where this hitter struggles. */
  coldZones: z.array(z.number().int().min(1).max(9)).max(9),
});

export const AiPitcherTendencySchema = z.object({
  /** Null when we don't have a clean opponent_players match (roster gaps). */
  opponentPlayerId: z.string().uuid().nullable(),
  displayName: z.string().min(1).max(200),
  approach: z.string().min(1).max(500),
  howToAttack: z.string().min(1).max(500),
});

export const AiKeyMatchupSchema = z.object({
  ourLabel: z.string().min(1).max(120),
  theirLabel: z.string().min(1).max(120),
  note: z.string().min(1).max(400),
});

export const AiScoutingCardSchema = z.object({
  hitterProfiles: z.array(AiHitterProfileSchema).max(20),
  pitcherTendencies: z.array(AiPitcherTendencySchema).max(10),
  teamTendencies: z.object({
    bullets: z.array(z.string().min(1).max(300)).max(6),
  }),
  keyMatchups: z.array(AiKeyMatchupSchema).max(6),
  oneLineSummary: z.string().min(1).max(300),
});

export type AiHitterProfile = z.infer<typeof AiHitterProfileSchema>;
export type AiPitcherTendency = z.infer<typeof AiPitcherTendencySchema>;
export type AiKeyMatchup = z.infer<typeof AiKeyMatchupSchema>;
export type AiScoutingCard = z.infer<typeof AiScoutingCardSchema>;

/** The computed batting line + pitch-mix we render alongside the AI narrative. */
export interface ScoutingHitterStats {
  opponentPlayerId: string;
  displayName: string;
  position?: string;
  bats?: string;
  pa: number;
  ab: number;
  h: number;
  hr: number;
  k: number;
  bb: number;
  avg: string;
  obp: string;
  slg: string;
  ops: string;
}

export interface ScoutingPitcherStats {
  opponentPlayerId: string | null;
  displayName: string;
  pitches: number;
  pitchMix: Array<{ pitchType: string; count: number; percent: number }>;
  avgVelocity: number | null;
  firstPitchStrikePct: number | null;
}

export interface PersistedScoutingCard {
  id: string;
  opponentTeamId: string;
  teamId: string;
  aiCard: AiScoutingCard;
  hitterStats: ScoutingHitterStats[];
  pitcherStats: ScoutingPitcherStats[];
  gameSampleCount: number;
  model: string;
  generatedBy?: string;
  generatedAt: string;
}
