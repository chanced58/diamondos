/**
 * Subscription tier definitions and feature gating.
 *
 * Three tiers: Free → Starter → Pro.
 * The `enterprise` value still exists in the Postgres enum but is not
 * surfaced in the application — removing a Postgres enum value is
 * unnecessarily destructive.
 */

export enum SubscriptionTier {
  FREE = 'free',
  STARTER = 'starter',
  PRO = 'pro',
}

export enum Feature {
  // Scoring
  PITCH_TYPE_LOCATION = 'pitch_type_location',
  SPRAY_CHARTS = 'spray_charts',

  // Stats
  ADVANCED_BATTING_STATS = 'advanced_batting_stats',
  ADVANCED_PITCHING_STATS = 'advanced_pitching_stats',
  OPPONENT_TRACKING = 'opponent_tracking',
  LEAGUE_WIDE_STATS = 'league_wide_stats',

  // Roster
  UNLIMITED_STAFF = 'unlimited_staff',
  PARENT_ACCESS = 'parent_access',

  // Communication
  TOPIC_CHANNELS = 'topic_channels',
  DIRECT_MESSAGES = 'direct_messages',
  PUSH_NOTIFICATIONS = 'push_notifications',

  // Compliance & planning
  PITCH_COUNT_COMPLIANCE = 'pitch_count_compliance',
  PRACTICE_PLANNING = 'practice_planning',
  MAXPREPS_EXPORT = 'maxpreps_export',

  // Pro-only
  CUSTOM_BRANDING = 'custom_branding',
  LEAGUE_MANAGEMENT = 'league_management',
  MULTI_TEAM_BILLING = 'multi_team_billing',
}

/** Features available at each tier. Higher tiers include all lower-tier features. */
const STARTER_FEATURES = new Set<Feature>([
  Feature.PITCH_TYPE_LOCATION,
  Feature.SPRAY_CHARTS,
  Feature.ADVANCED_BATTING_STATS,
  Feature.ADVANCED_PITCHING_STATS,
  Feature.UNLIMITED_STAFF,
  Feature.PARENT_ACCESS,
  Feature.TOPIC_CHANNELS,
  Feature.DIRECT_MESSAGES,
  Feature.PUSH_NOTIFICATIONS,
  Feature.PITCH_COUNT_COMPLIANCE,
  Feature.PRACTICE_PLANNING,
  Feature.MAXPREPS_EXPORT,
]);

const PRO_FEATURES = new Set<Feature>([
  ...STARTER_FEATURES,
  Feature.OPPONENT_TRACKING,
  Feature.LEAGUE_WIDE_STATS,
  Feature.CUSTOM_BRANDING,
  Feature.LEAGUE_MANAGEMENT,
  Feature.MULTI_TEAM_BILLING,
]);

const TIER_FEATURES: Record<SubscriptionTier, Set<Feature>> = {
  [SubscriptionTier.FREE]: new Set<Feature>(),
  [SubscriptionTier.STARTER]: STARTER_FEATURES,
  [SubscriptionTier.PRO]: PRO_FEATURES,
};

/** Check whether a subscription tier grants access to a specific feature. */
export function hasFeature(tier: SubscriptionTier, feature: Feature): boolean {
  return TIER_FEATURES[tier]?.has(feature) ?? false;
}

/** All tiers available in the application (excludes enterprise). */
export const APP_TIERS = [
  SubscriptionTier.FREE,
  SubscriptionTier.STARTER,
  SubscriptionTier.PRO,
] as const;
