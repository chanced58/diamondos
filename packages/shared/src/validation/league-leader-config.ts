import { z } from 'zod';
import { STAT_CATALOG } from '../constants/stat-catalog';

const STAT_KEYS = STAT_CATALOG.map((s) => s.key) as [string, ...string[]];

const customCategorySchema = z.object({
  statKey: z.enum(STAT_KEYS),
  label: z.string().min(1).max(40),
  limit: z.number().int().min(3).max(25).default(10),
});

export const leagueLeaderConfigSchema = z.object({
  custom: z.array(customCategorySchema).max(5).default([]),
  qualifierOverrides: z.object({
    paPerGame: z.number().min(0).max(10).optional(),
    ipPerGame: z.number().min(0).max(10).optional(),
  }).default({}),
}).strict();

export type LeagueLeaderConfig = z.infer<typeof leagueLeaderConfigSchema>;
export type CustomCategory = z.infer<typeof customCategorySchema>;

export const DEFAULT_LEADER_CONFIG: LeagueLeaderConfig = { custom: [], qualifierOverrides: {} };
