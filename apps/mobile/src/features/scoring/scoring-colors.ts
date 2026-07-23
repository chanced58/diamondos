/**
 * Shared className constants for the scoring screens, so buttons/dots/bases
 * across PitchInput, BaserunnerDisplay, CountDisplay, and the substitution/
 * DP/error/rundown modals all draw from one small, web-matching palette
 * instead of an ad hoc rainbow of colors.
 */

export const BUTTON_NEUTRAL = 'bg-white border border-gray-300';
export const BUTTON_NEUTRAL_TEXT = 'text-gray-900';
export const BUTTON_NEUTRAL_SELECTED = 'bg-gray-700 border border-gray-800';
export const BUTTON_NEUTRAL_SELECTED_TEXT = 'text-white';

export const BUTTON_BRAND = 'bg-brand-600 border border-brand-700';
export const BUTTON_BRAND_TEXT = 'text-white';
export const BUTTON_BRAND_SOFT = 'bg-brand-50 border border-brand-200';
export const BUTTON_BRAND_SOFT_TEXT = 'text-brand-700';

export const BUTTON_DANGER = 'bg-red-600 border border-red-700';
export const BUTTON_DANGER_TEXT = 'text-white';
export const BUTTON_DANGER_SOFT = 'bg-red-50 border border-red-200';
export const BUTTON_DANGER_SOFT_TEXT = 'text-red-700';

export const BUTTON_WARNING_SOFT = 'bg-orange-50 border border-orange-200';
export const BUTTON_WARNING_SOFT_TEXT = 'text-orange-700';

export const BUTTON_DISABLED = 'opacity-40';

export const DOT_BALL_FILLED = 'bg-green-500 border-2 border-green-600';
export const DOT_STRIKE_FILLED = 'bg-yellow-400 border-2 border-yellow-500';
export const DOT_OUT_FILLED = 'bg-red-500 border-2 border-red-600';
export const DOT_EMPTY = 'border-2 border-gray-300 bg-transparent';

export const BASE_OCCUPIED = 'bg-brand-500 border-2 border-brand-600';
export const BASE_EMPTY = 'bg-white border-2 border-gray-400';
export const BASE_HOME_PLATE = 'bg-gray-200 border-2 border-gray-400';

// Solid "pill" buttons (OutcomeButton) — a bounded, semantic set replacing
// the previous ad hoc rainbow (one color per button regardless of what kind
// of play it represented).
export const PILL_HIT_1B = 'bg-brand-600';
export const PILL_HIT_2B = 'bg-brand-700';
export const PILL_HIT_3B = 'bg-brand-800';
export const PILL_HIT_HR = 'bg-amber-600';
export const PILL_NEUTRAL_OUT = 'bg-gray-600';
export const PILL_SACRIFICE = 'bg-teal-600';
export const PILL_BASERUNNING_OUT = 'bg-rose-600';
export const PILL_MULTI_OUT_PLAY = 'bg-zinc-700';
export const PILL_ROSTER = 'bg-sky-700';
