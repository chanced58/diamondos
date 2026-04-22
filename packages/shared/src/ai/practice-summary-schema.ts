import { z } from 'zod';

export const StandoutPlayerSchema = z.object({
  playerId: z.string().uuid(),
  reason: z.string().min(1).max(300),
});

export const ConcernSchema = z.object({
  playerId: z.string().uuid().nullable(),
  note: z.string().min(1).max(300),
});

export const AiPracticeSummarySchema = z.object({
  coachRecap: z.string().min(1).max(3000),
  standoutPlayers: z.array(StandoutPlayerSchema).max(10),
  concerns: z.array(ConcernSchema).max(10),
  playerSummaries: z.record(z.string().uuid(), z.string().min(1).max(600)),
});

export type AiStandoutPlayer = z.infer<typeof StandoutPlayerSchema>;
export type AiConcern = z.infer<typeof ConcernSchema>;
export type AiPracticeSummary = z.infer<typeof AiPracticeSummarySchema>;

export interface PersistedPracticeSummary {
  id: string;
  practiceId: string;
  teamId: string;
  coachRecap: string;
  standoutPlayers: AiStandoutPlayer[];
  concerns: AiConcern[];
  playerSummaries: Record<string, string>;
  model: string;
  generatedBy?: string;
  generatedAt: string;
}
