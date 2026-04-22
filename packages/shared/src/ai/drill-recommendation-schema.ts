import { z } from 'zod';

const Impact = z.enum(['high', 'medium', 'low']);

export const AiDrillRecommendationSchema = z.object({
  drillId: z.string().uuid(),
  rationale: z.string().min(1).max(400),
  expectedImpact: Impact,
  addressesDeficits: z.array(z.string().min(1).max(100)).max(5),
});

export const AiDrillRecommendationsSchema = z.object({
  rankedDrills: z.array(AiDrillRecommendationSchema).max(10),
  summary: z.string().min(1).max(400),
});

export type AiDrillRecommendation = z.infer<typeof AiDrillRecommendationSchema>;
export type AiDrillRecommendations = z.infer<typeof AiDrillRecommendationsSchema>;
