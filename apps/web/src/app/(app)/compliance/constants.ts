import { EventType } from '@baseball/shared';

/**
 * Event types relevant for stats derivation. Derived from the EventType enum
 * (plus the 'game_reset' literal that actions.ts appends as a correction
 * marker) so adding a new event type never silently drops out of season
 * aggregation. The prior hand-maintained allowlist silently dropped
 * dropped_third_strike, catcher_interference, triple_play, balk,
 * pickoff_attempt, rundown, baserunner_advance, baserunner_out,
 * pitch_reverted, event_voided, substitution, and game_end — causing
 * season-level stats to undercount PAs, outs, RBIs, and pitcher events.
 */
export const RELEVANT_EVENT_TYPES = [
  ...Object.values(EventType),
  'game_reset',
] as const;
