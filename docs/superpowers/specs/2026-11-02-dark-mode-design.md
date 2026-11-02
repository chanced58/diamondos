# Dark Mode — Web + Mobile

**Date:** 2026-11-02
**Status:** Draft, awaiting approval (builder check done)
**Branch:** `feature/dark-mode`

## Intent

Some coaches, parents and players just prefer dark apps. Dark mode is a **comfort preference**, not a game-time tool: it isn't tuned for field lights or glare, and it doesn't touch live scorekeeping. Success means a signed-in user who likes dark UIs can live in DiamondOS on the web and on their phone without hitting white screens, and a user whose device is already in dark mode gets that automatically.

## Goals

- A theme setting with four choices: **System / Light / Dark / Dugout**, on both web and mobile.
  - **System** (the default) follows the OS / browser `prefers-color-scheme` and switches live when the OS switches. It only ever resolves to Light or Dark, never Dugout.
  - **Dark** is the new **neutral charcoal** palette (below).
  - **Dugout** is the existing green-black palette, kept as an opt-in alternative.
- Every **signed-in** screen renders correctly in Dark and Dugout. No unconverted white panels, unreadable gray-on-black text, or invisible borders.
- Released **all at once per platform**: no user ever sees a half-dark app. Work happens on `feature/dark-mode`; web ships when every in-scope web screen is done, mobile ships in the first EAS build after every in-scope mobile screen is done. The two don't have to wait for each other. *(Product owner asked for "whichever is simplest for the user"; per-platform keeps that guarantee without tying a web deploy to an App Store review.)*

## Non-goals

- **Public pages stay light.** League home (`/l/[slug]/…`), team stat pages, public player pages (`/p/…`), `/leagues`, `/about`, `/demo` and `/offline` are out of scope. They keep their per-league color schemes on a light base regardless of the user's setting.
  - The **parent live-score view is in scope** (decided): it requires sign-in, so it follows the theme. Web `apps/web/src/app/(app)/live/[gameId]` already uses tokens; mobile `apps/mobile/app/(tabs)/schedule/games/[gameId]/live.tsx` (~20 hardcoded colors) and any live-view components it shares need converting. Where it reuses scoring components (scoreboard, count, diamond), those components must render correctly in both modes: forced light inside the scorer, themed inside the live view.
- **Auth screens stay light** (web `(auth)`, mobile `(auth)`). They sit before sign-in and so fall under "signed-in app only". *(Builder's call recorded here; see "Calls made".)*
- **Live scorekeeping stays light.** Web `apps/web/src/app/(app)/games/[gameId]/score/` and mobile `apps/mobile/app/(tabs)/schedule/games/[gameId]/score.tsx` plus `apps/mobile/src/features/scoring/` render in Light no matter the setting. They are not converted. Only the **content area** is forced light; the surrounding app chrome (web sidebar, mobile tab bar / header / status bar) follows the theme like any other screen, so no route-aware shell logic is needed. Scoring modals (`FieldLocationModal`, `ThrowSequenceModal`, `GuestPlayerModal`) count as content and stay light.
- No account-level sync of the preference. It's per device / per browser.
- No changes to Density, Motion or Visual tone settings beyond what's needed to keep them working.
- No per-league dark branding work beyond what already exists in `globals.css`.

## Anti-goals (would be a failure even if it "works")

- A half-converted release where System-dark users land on mixed light/dark screens.
- A flash of the wrong theme on page load (web) or app launch (mobile).
- Pitch-count severity (safe / warning / danger) becoming hard to tell apart in dark.
- Public league pages turning dark because a logged-in visitor has Dark set.
- Scorekeeping screens changing appearance mid-game.
- Noticeable runtime cost. Theme switching must be CSS variables / NativeWind color scheme, not re-rendering or JS-computed styles per component.

## Palette (decided: neutral charcoal)

Chosen from mockups. Neutral near-black grays, blue reserved for primary actions and links.

| Token | Light (unchanged) | Dark (new charcoal) |
|---|---|---|
| `--app-bg` | gray-50 `#f9fafb` | `#0f1115` |
| `--app-surface` | `#ffffff` | `#181b22` |
| `--app-surface-2` | gray-50 | `#14171d` |
| `--app-surface-raised` | `#ffffff` | `#1e222b` |
| `--app-border` | gray-200 | `#2a2f3a` |
| `--app-border-strong` | gray-300 | `#3a404d` |
| `--app-fg` | gray-900 | `#e7e9ee` |
| `--app-fg-muted` | gray-500 | `#9ba1ad` |
| `--app-fg-subtle` | gray-400 | `#6b7280` |
| `--app-sidebar-bg` | `#1e2d6b` | `#0a0c10` |
| `--app-sidebar-fg` | `#ffffff` | `#e7e9ee` |
| `--app-sidebar-active` | `#1e3a8a` | `#232833` |
| `--app-brand` | brand-700 | `#2563eb` |
| `--app-brand-2` | brand-500 | `#60a5fa` |

`--app-brand` is the fill for primary buttons (white text on `#2563eb` ≈ 5.2:1; the mockup's `#3b82f6` is only 3.7:1, so it's darkened one step). `--app-brand-2` is for links and accent text on dark surfaces. `--app-surface-2`, `--app-border-strong` and `--app-brand-2` dark values weren't in the mockup; they're the builder's call and can be tuned during implementation within the contrast rule below.

The **Dugout** palette is the existing `[data-theme="dugout"]` block in `apps/web/src/app/globals.css`, unchanged. The existing navy `[data-theme="dark"]` block is **replaced** by charcoal.

**Status colors in dark** (pitch count, RSVP, badges, alerts): keep the same hues, use brighter foregrounds on low-alpha tinted backgrounds, e.g. safe `#4ade80` on `color-mix(#22c55e 18%)`, warning `#facc15` on `color-mix(#eab308 18%)`, danger `#f87171` on `color-mix(#ef4444 18%)`. Same pattern for the `--green/yellow/orange/red/blue/purple-*` tinted helpers, which need dark overrides.

## Constraints

- **Stack:** Next.js 14 + Tailwind (web), Expo SDK 51 + NativeWind v4 (mobile). Build on what's there; no new theming library unless NativeWind can't do something required.
- **Contrast (applies to Dark and Dugout; Light tokens are not changed):** `--app-fg` and `--app-fg-muted` ≥ 4.5:1 on every surface; `--app-fg-subtle` is for non-essential text only (timestamps, placeholders, captions) and needs ≥ 3:1; button text on `--app-brand` ≥ 4.5:1; borders on form inputs and controls ≥ 3:1. Decorative dividers and card outlines (`--app-border`) are exempt, matching how Light already works. Light's existing tokens stay as they are; this project doesn't restyle the light app.
- **Scale of the conversion** (rough counts of hardcoded color classes/hex values on `main`, Nov 2026):
  - Web signed-in app ~3,900 (largest: `games/` ~1,290 of which `score/` ~450 is excluded, `teams/` ~660, `practices/` ~620, `admin/` ~370, `league/` ~360, `compliance/` ~180) plus shared `components/` ~680. `dashboard/`, `live/`, `settings/`, `training/` already use tokens.
  - Mobile `(tabs)` ~1,125 (of which `score.tsx` ~200 is excluded), `src/features/` ~600 (of which `scoring/` ~220 is excluded), `packages/ui` ~60. Roughly 1,370 in scope.
- **No flash:** the theme has to be applied before first paint on web and before the first screen renders on mobile.
- **Offline-first mobile:** the preference must load without network.
- Follow repo conventions in `CLAUDE.md` (Conventional Commits, commit per unit of work, CodeRabbit review after the feature, tests for pure logic).

## How it works

### Web

**What already exists:** `ThemeProvider` / `AppearanceBootstrap` in `apps/web/src/components/providers/ThemeProvider.tsx` store `dos_theme` in localStorage and set `data-theme` on `<html>`. `Settings → Appearance` (`apps/web/src/app/(app)/settings/appearance/AppearanceSettingsClient.tsx`) has a Light / Dark / Dugout picker. Tailwind exposes the tokens as `app-*` colors (`bg-app-surface`, `text-app-fg`, …).

**Changes (decided in conversation):**
1. Add **System** as a theme value and make it the default. Stored preference is `system | light | dark | dugout`. The resolved theme (`light | dark | dugout`) is what drives colors. System listens to `matchMedia('(prefers-color-scheme: dark)')` changes. The pre-paint bootstrap script has to resolve System the same way so there's no flash.
2. Replace the navy dark values with charcoal.
3. **Scope the theme to the signed-in app.** Today `data-theme` lands on `<html>`, so it would darken public pages too. The signed-in shell (`apps/web/src/app/(app)/layout.tsx`) is where dark applies. Public routes, auth routes and the scoring screen always resolve to Light.
4. Update the Appearance page copy and options (System / Light / Dark / Dugout). The current copy pitches Dark as "cuts glare in the dugout", which no longer matches the intent.
5. Convert hardcoded colors in every in-scope screen and shared component to the `app-*` tokens (or other theme-aware classes) so they follow the theme.

**Left to the builder:**
- How to scope (e.g. moving the attribute to a wrapper in `(app)/layout.tsx`, or keeping it on `<html>` and forcing light on public/auth/score layouts). Must not flash, and portals/modals/toasts rendered outside the wrapper must still pick up the theme.
- Whether to use Tailwind `darkMode` variants, token-only classes, or both. Token-only is preferred since there are two dark palettes.
- How to handle `viewport.themeColor` / `appleWebApp.statusBarStyle` and the `color-scheme` CSS property for native form controls and scrollbars.
- Conversion order and batching.
- Charts, spray charts, heatmaps and the diamond illustrations (`components/ui/`) need dark-legible colors. Exact values are the builder's call.

**Team branding (decided):** in Dark and Dugout, team custom colors are ignored. `components/layout/Sidebar.tsx` currently overrides `--app-sidebar-bg` / `--app-sidebar-active` with the team's `primaryColor` / `secondaryColor` in every theme. That override applies in Light only; Dark shows the charcoal sidebar and Dugout its green-black one. Any other place team colors appear in the signed-in app follows the same rule.

**League color schemes:** `globals.css` has `[data-theme="dark"] .league-scheme-*` overrides but none for Dugout. Add matching `[data-theme="dugout"]` overrides (reusing the dark values is fine) so league accents on the signed-in `league/` pages stay legible on green-black.

### Mobile

**What exists:** NativeWind v4 with a `brand` scale only; `app.json` pins `"userInterfaceStyle": "light"`; no theme provider; no appearance setting. Tabs are `(home)`, `schedule`, `stats`, `messages` and `more` (`apps/mobile/app/(tabs)/more/` holds roster, members, seasons, league admin, etc.). `expo-secure-store` is installed; WatermelonDB local storage is available.

**Changes (decided in conversation):**
1. Set `userInterfaceStyle` to `"automatic"` so the OS scheme reaches the app.
2. Add the same System / Light / Dark / Dugout preference, persisted on device, default System.
3. Add an **Appearance** screen under the **More** tab (`apps/mobile/app/(tabs)/more/`).
4. Introduce theme tokens mirroring web (same names, same values) and convert in-scope screens and `packages/ui` components to them.
5. Scoring (`schedule/games/[gameId]/score.tsx`, `src/features/scoring/`) and `(auth)` stay light.

**Left to the builder:**
- The token mechanism. NativeWind v4 supports CSS variables via `vars()` and `colorScheme`; a provider that sets variables at the root is the expected route, but any approach that keeps switching cheap is fine.
- Where to persist (secure-store vs WatermelonDB local storage vs adding AsyncStorage).
- Status bar style, tab bar and navigation header colors, splash background, keyboard appearance.
- `react-native-svg` diagrams outside scoring that need dark colors.

### Shared

`packages/ui/src/theme/colors.ts` is light-only. Making a single source of truth for token values that both apps read is welcome but not required. Builder's call whether it's worth it.

## Testing / verification

- Unit tests for any pure logic (e.g. resolving `system` → `light|dark`, parsing stored values).
- Visual pass of every in-scope screen in Light, Dark and Dugout on web and the iOS simulator before release.
- Confirm public pages, auth screens and both scoring screens stay light with Dark set.
- Confirm System follows an OS switch live, and that there's no flash on reload / cold start.
- CodeRabbit review after implementation (per `CLAUDE.md`).

## Calls made (not explicitly decided by the product owner)

- Preference is stored per device, not on the account. (Proposed in conversation, not objected to.)
- Auth screens stay light.
- Dugout is offered on mobile too.
- Dark replaces the existing navy palette rather than being added alongside it.
- Brighter status-color treatment in dark.
- Mobile Appearance screen lives under the More tab.
- Each platform releases on its own once it's fully converted.
- On scoring screens only the content area is forced light; app chrome follows the theme.
- Contrast rule applies to Dark and Dugout only; Light tokens untouched. Dark brand fill darkened to `#2563eb` for button legibility.
- Dugout gets league-scheme overrides.
