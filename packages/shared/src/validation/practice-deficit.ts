import { z } from 'zod';
import { PracticeDrillDeficitPriority } from '../types/practice-deficit';
import { PracticeSkillCategory } from '../types/practice-drill';

const SLUG_RE = /^[a-z0-9-]{1,80}$/;

export const createDeficitSchema = z.object({
  slug: z.string().regex(SLUG_RE, 'slug must be 1–80 chars of [a-z0-9-]'),
  name: z.string().trim().min(1, 'name required').max(120, 'name too long'),
  description: z
    .string()
    .trim()
    .max(1000, 'description too long')
    .optional(),
  skillCategories: z
    .array(z.nativeEnum(PracticeSkillCategory))
    .min(1, 'at least one skill category required'),
});

export type CreateDeficitInput = z.infer<typeof createDeficitSchema>;

export const updateDeficitSchema = createDeficitSchema.partial();
export type UpdateDeficitInput = z.infer<typeof updateDeficitSchema>;

export const drillDeficitTagSchema = z.object({
  drillId: z.string().uuid(),
  deficitId: z.string().uuid(),
  teamId: z.string().uuid(),
  priority: z.nativeEnum(PracticeDrillDeficitPriority),
});
export type DrillDeficitTagInput = z.infer<typeof drillDeficitTagSchema>;
