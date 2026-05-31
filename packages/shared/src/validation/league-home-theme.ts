import { z } from 'zod';

export const ALL_SECTIONS = ['hero', 'standings', 'leaders', 'customLeaders', 'recent', 'spotlights'] as const;
export type SectionId = (typeof ALL_SECTIONS)[number];

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'must be a #RRGGBB hex color');
const sectionSchema = z.object({ id: z.enum(ALL_SECTIONS), enabled: z.boolean() });

export const leagueHomeThemeSchema = z.object({
  accentColor: hex,
  secondaryColor: hex,
  bannerUrl: z.string().url().nullable(),
  heroTitle: z.string().max(80),
  heroTagline: z.string().max(160),
  sections: z.array(sectionSchema),
}).strict();

export type LeagueHomeTheme = z.infer<typeof leagueHomeThemeSchema>;

export const DEFAULT_LEAGUE_HOME_THEME: LeagueHomeTheme = {
  accentColor: '#1e90ff', secondaryColor: '#0b1f3a', bannerUrl: null,
  heroTitle: '', heroTagline: '', sections: ALL_SECTIONS.map((id) => ({ id, enabled: true })),
};

export function mergeWithThemeDefaults(input: unknown): LeagueHomeTheme {
  const partial = (input ?? {}) as Partial<LeagueHomeTheme>;
  const provided = new Map((partial.sections ?? []).map((s) => [s.id, s.enabled]));
  return {
    accentColor: partial.accentColor ?? DEFAULT_LEAGUE_HOME_THEME.accentColor,
    secondaryColor: partial.secondaryColor ?? DEFAULT_LEAGUE_HOME_THEME.secondaryColor,
    bannerUrl: partial.bannerUrl ?? null,
    heroTitle: partial.heroTitle ?? '',
    heroTagline: partial.heroTagline ?? '',
    sections: ALL_SECTIONS.map((id) => ({ id, enabled: provided.get(id) ?? true })),
  };
}
