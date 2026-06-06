import { z } from 'zod';

export const ALL_SECTIONS = ['hero', 'standings', 'leaders', 'customLeaders', 'recent', 'spotlights'] as const;
export type SectionId = (typeof ALL_SECTIONS)[number];

/**
 * Curated, selectable color schemes for a league's public page + coach dashboard.
 * The accent values live in CSS (`.league-scheme-<key>` in globals.css, with a
 * light + dark variant); this list is the source of truth for the keys and the
 * admin picker metadata. `swatch` is a representative accent for the picker.
 *
 * Keep these keys in sync with the `.league-scheme-<key>` classes in
 * apps/web/src/app/globals.css.
 */
export const LEAGUE_COLOR_SCHEME_KEYS = [
  'sandlot',
  'royal-blue',
  'crimson',
  'royal-purple',
  'sunset-orange',
  'teal',
] as const;
export type LeagueColorScheme = (typeof LEAGUE_COLOR_SCHEME_KEYS)[number];

export const LEAGUE_COLOR_SCHEMES: ReadonlyArray<{ key: LeagueColorScheme; label: string; swatch: string }> = [
  { key: 'sandlot', label: 'Sandlot (grass & dirt)', swatch: '#15803d' },
  { key: 'royal-blue', label: 'Royal Blue', swatch: '#1e3a8a' },
  { key: 'crimson', label: 'Crimson', swatch: '#b91c1c' },
  { key: 'royal-purple', label: 'Royal Purple', swatch: '#6d28d9' },
  { key: 'sunset-orange', label: 'Sunset Orange', swatch: '#c2410c' },
  { key: 'teal', label: 'Teal', swatch: '#0e7490' },
];

const DEFAULT_COLOR_SCHEME: LeagueColorScheme = 'sandlot';

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'must be a #RRGGBB hex color');
const sectionSchema = z.object({ id: z.enum(ALL_SECTIONS), enabled: z.boolean() });

export const leagueHomeThemeSchema = z.object({
  // accentColor/secondaryColor are retained for backward-compat with stored rows
  // but are no longer edited — the league identity comes from `colorScheme`.
  accentColor: hex,
  secondaryColor: hex,
  colorScheme: z.enum(LEAGUE_COLOR_SCHEME_KEYS).default(DEFAULT_COLOR_SCHEME),
  bannerUrl: z.string().url().nullable(),
  heroTitle: z.string().max(80),
  heroTagline: z.string().max(160),
  sections: z.array(sectionSchema),
}).strict();

export type LeagueHomeTheme = z.infer<typeof leagueHomeThemeSchema>;

export const DEFAULT_LEAGUE_HOME_THEME: LeagueHomeTheme = {
  accentColor: '#15803d', secondaryColor: '#a1552a', colorScheme: DEFAULT_COLOR_SCHEME, bannerUrl: null,
  heroTitle: '', heroTagline: '', sections: ALL_SECTIONS.map((id) => ({ id, enabled: true })),
};

function isColorScheme(v: unknown): v is LeagueColorScheme {
  return typeof v === 'string' && (LEAGUE_COLOR_SCHEME_KEYS as readonly string[]).includes(v);
}

export function mergeWithThemeDefaults(input: unknown): LeagueHomeTheme {
  const partial = (typeof input === 'object' && input !== null ? input : {}) as Partial<LeagueHomeTheme>;
  const sectionsInput = Array.isArray(partial.sections) ? partial.sections : [];
  const provided = new Map(
    sectionsInput
      .filter((s): s is { id: SectionId; enabled: boolean } => !!s && typeof s === 'object')
      .map((s) => [s.id, s.enabled]),
  );
  return {
    accentColor: partial.accentColor ?? DEFAULT_LEAGUE_HOME_THEME.accentColor,
    secondaryColor: partial.secondaryColor ?? DEFAULT_LEAGUE_HOME_THEME.secondaryColor,
    colorScheme: isColorScheme(partial.colorScheme) ? partial.colorScheme : DEFAULT_COLOR_SCHEME,
    bannerUrl: partial.bannerUrl ?? null,
    heroTitle: partial.heroTitle ?? '',
    heroTagline: partial.heroTagline ?? '',
    sections: ALL_SECTIONS.map((id) => ({ id, enabled: provided.get(id) ?? true })),
  };
}
