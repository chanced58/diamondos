import type { BattingStats } from '../types/batting';
import type { PitchingStats } from '../types/pitching';
import type { StatTier } from '../types/team';
import { formatBattingPct, formatBattingRate } from './batting-stats';
import { formatInningsPitched } from './pitching-stats';
import { utcToZonedDateTime } from './date';

/**
 * The season stats tables' columns — which show at each stat tier and on the
 * free plan, how each formats, and how the totals row adds up. One definition
 * for the web stats page and the mobile Stats tab, so the two can't drift.
 *
 * Rates may arrive as NaN (computed here or on the web) or null (the mobile
 * API sends no NaN); both read as "no value" and format as '---'.
 */

export type StatFormat = 'int' | 'rate' | 'pct' | 'dec' | 'ip';

export interface SeasonStatColumn<K extends string> {
  key: K;
  label: string;
  title: string;
  format: StatFormat;
}

/** A numeric value as it may reach a table: number, NaN or null. */
type StatValue = number | null | undefined;

function hasValue(value: StatValue): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** One stat as the tables show it. */
export function formatSeasonStat(value: StatValue, format: StatFormat): string {
  if (format === 'ip') return hasValue(value) ? formatInningsPitched(value) : '---';
  if (format === 'int') return hasValue(value) ? String(value) : '---';
  if (!hasValue(value)) return '---';
  switch (format) {
    case 'rate': return formatBattingRate(value);
    case 'pct': return formatBattingPct(value);
    case 'dec': return value.toFixed(2);
  }
}

// ── Batting ─────────────────────────────────────────────────────────────────

export type SeasonBattingStatKey = keyof Omit<BattingStats, 'playerId' | 'playerName'>;

export const BATTING_SEASON_COLUMNS: SeasonStatColumn<SeasonBattingStatKey>[] = [
  { key: 'gamesAppeared',    label: 'G',     title: 'Games appeared',           format: 'int' },
  { key: 'plateAppearances', label: 'PA',    title: 'Plate appearances',        format: 'int' },
  { key: 'atBats',           label: 'AB',    title: 'At-bats',                  format: 'int' },
  { key: 'runs',             label: 'R',     title: 'Runs scored',              format: 'int' },
  { key: 'hits',             label: 'H',     title: 'Hits',                     format: 'int' },
  { key: 'doubles',          label: '2B',    title: 'Doubles',                  format: 'int' },
  { key: 'triples',          label: '3B',    title: 'Triples',                  format: 'int' },
  { key: 'homeRuns',         label: 'HR',    title: 'Home runs',                format: 'int' },
  { key: 'rbi',              label: 'RBI',   title: 'Runs batted in',           format: 'int' },
  { key: 'walks',            label: 'BB',    title: 'Walks',                    format: 'int' },
  { key: 'strikeouts',       label: 'K',     title: 'Strikeouts',               format: 'int' },
  { key: 'hitByPitch',       label: 'HBP',   title: 'Hit by pitch',             format: 'int' },
  { key: 'sacrificeFlies',   label: 'SF',    title: 'Sacrifice flies',          format: 'int' },
  { key: 'avg',              label: 'AVG',   title: 'Batting average (H / AB)', format: 'rate' },
  { key: 'obp',              label: 'OBP',   title: 'On-base percentage',       format: 'rate' },
  { key: 'slg',              label: 'SLG',   title: 'Slugging percentage',      format: 'rate' },
  { key: 'ops',              label: 'OPS',   title: 'On-base plus slugging',    format: 'rate' },
  { key: 'iso',              label: 'ISO',   title: 'Isolated power (SLG − AVG)', format: 'rate' },
  { key: 'babip',            label: 'BABIP', title: 'Batting avg on balls in play — contact/luck indicator', format: 'rate' },
  { key: 'kPct',             label: 'K%',    title: 'Strikeout rate (K / PA)',  format: 'pct' },
  { key: 'bbPct',            label: 'BB%',   title: 'Walk rate (BB / PA)',      format: 'pct' },
  { key: 'woba',             label: 'wOBA',  title: 'Weighted on-base average (FanGraphs 2023 weights)', format: 'rate' },
  { key: 'hardHitBalls',     label: 'HHB',   title: 'Hard Hit Balls — line drives, deep fly balls, and home runs', format: 'int' },
  { key: 'hardHitPct',       label: 'HHB%',  title: 'Hard Hit Ball rate (HHB / total batted balls)', format: 'pct' },
  { key: 'qab',              label: 'QAB',   title: 'Quality At-Bats — hit, walk, HBP, sacrifice, 8+ pitch PA, hard-hit ball, or productive out', format: 'int' },
  { key: 'qabPct',           label: 'QAB%',  title: 'Quality At-Bat rate (QAB / PA)', format: 'pct' },
];

const BATTING_TIER_KEYS: Record<StatTier, ReadonlySet<SeasonBattingStatKey>> = {
  youth: new Set<SeasonBattingStatKey>([
    'gamesAppeared', 'plateAppearances', 'atBats', 'runs', 'hits', 'rbi', 'walks', 'strikeouts',
    'avg', 'obp', 'ops', 'hardHitPct',
  ]),
  high_school: new Set<SeasonBattingStatKey>([
    'gamesAppeared', 'plateAppearances', 'atBats', 'runs', 'hits', 'doubles', 'triples', 'homeRuns', 'rbi',
    'walks', 'strikeouts', 'hitByPitch', 'sacrificeFlies',
    'avg', 'obp', 'slg', 'ops', 'iso', 'babip', 'kPct', 'bbPct', 'woba', 'hardHitPct', 'qab', 'qabPct',
  ]),
  college: new Set<SeasonBattingStatKey>(BATTING_SEASON_COLUMNS.map((c) => c.key)),
};

/** Counting stats and AVG: what the free plan shows. */
const FREE_BATTING_KEYS: ReadonlySet<SeasonBattingStatKey> = new Set<SeasonBattingStatKey>([
  'gamesAppeared', 'plateAppearances', 'atBats', 'runs', 'hits', 'doubles', 'triples', 'homeRuns', 'rbi',
  'walks', 'strikeouts', 'hitByPitch', 'sacrificeFlies', 'avg',
]);

/** The batting columns for a stat tier; `advanced` is the plan's ADVANCED_BATTING_STATS feature. */
export function visibleBattingColumns(tier: StatTier, advanced: boolean): SeasonStatColumn<SeasonBattingStatKey>[] {
  return BATTING_SEASON_COLUMNS.filter(
    (col) => BATTING_TIER_KEYS[tier].has(col.key) && (advanced || FREE_BATTING_KEYS.has(col.key)),
  );
}

type BattingCounts = Pick<BattingStats,
  | 'gamesAppeared' | 'plateAppearances' | 'atBats' | 'runs' | 'hits' | 'doubles' | 'triples' | 'homeRuns'
  | 'rbi' | 'walks' | 'strikeouts' | 'hitByPitch' | 'sacrificeFlies' | 'sacrificeHits'
  | 'battedBalls' | 'hardHitBalls' | 'qab'
> & { qabPct: StatValue };

/**
 * The totals row: counting stats summed, rates recomputed from the sums (never
 * averaged). QAB% counts only rows that track QAB — opponent rows don't.
 */
export function battingTotals(rows: BattingCounts[]): Record<SeasonBattingStatKey, number> {
  const t = rows.reduce(
    (acc, s) => ({
      g: acc.g + s.gamesAppeared, pa: acc.pa + s.plateAppearances, ab: acc.ab + s.atBats, r: acc.r + s.runs,
      h: acc.h + s.hits, d: acc.d + s.doubles, tr: acc.tr + s.triples, hr: acc.hr + s.homeRuns, rbi: acc.rbi + s.rbi,
      bb: acc.bb + s.walks, k: acc.k + s.strikeouts, hbp: acc.hbp + s.hitByPitch, sf: acc.sf + s.sacrificeFlies,
      sh: acc.sh + s.sacrificeHits, batted: acc.batted + s.battedBalls, hhb: acc.hhb + s.hardHitBalls, qab: acc.qab + s.qab,
      qabTrackedPA: acc.qabTrackedPA + (hasValue(s.qabPct) ? s.plateAppearances : 0),
    }),
    { g: 0, pa: 0, ab: 0, r: 0, h: 0, d: 0, tr: 0, hr: 0, rbi: 0, bb: 0, k: 0, hbp: 0, sf: 0, sh: 0, batted: 0, hhb: 0, qab: 0, qabTrackedPA: 0 },
  );

  const singles = t.h - t.d - t.tr - t.hr;
  const totalBases = singles + 2 * t.d + 3 * t.tr + 4 * t.hr;
  const avg = t.ab > 0 ? t.h / t.ab : NaN;
  const slg = t.ab > 0 ? totalBases / t.ab : NaN;
  const obpDenominator = t.ab + t.bb + t.hbp + t.sf;
  const obp = obpDenominator > 0 ? (t.h + t.bb + t.hbp) / obpDenominator : NaN;
  const babipDenominator = t.ab - t.k - t.hr + t.sf;
  const wobaDenominator = t.ab + t.bb + t.sf + t.hbp;

  return {
    gamesAppeared: t.g, plateAppearances: t.pa, atBats: t.ab, runs: t.r, hits: t.h,
    doubles: t.d, triples: t.tr, homeRuns: t.hr, rbi: t.rbi, walks: t.bb, strikeouts: t.k,
    hitByPitch: t.hbp, sacrificeFlies: t.sf, sacrificeHits: t.sh,
    avg, obp, slg,
    ops: obp + slg,
    iso: slg - avg,
    babip: babipDenominator > 0 ? (t.h - t.hr) / babipDenominator : NaN,
    kPct: t.pa > 0 ? t.k / t.pa : NaN,
    bbPct: t.pa > 0 ? t.bb / t.pa : NaN,
    woba: wobaDenominator > 0
      ? (0.69 * t.bb + 0.72 * t.hbp + 0.89 * singles + 1.27 * t.d + 1.62 * t.tr + 2.10 * t.hr) / wobaDenominator
      : NaN,
    battedBalls: t.batted,
    hardHitBalls: t.hhb,
    hardHitPct: t.batted > 0 ? t.hhb / t.batted : NaN,
    qab: t.qab,
    qabPct: t.qabTrackedPA > 0 ? t.qab / t.qabTrackedPA : NaN,
  };
}

// ── Pitching ────────────────────────────────────────────────────────────────

export type SeasonPitchingStatKey =
  | 'inningsPitchedOuts' | 'totalPitches' | 'strikePercentage' | 'firstPitchStrikePercentage'
  | 'threeBallCountPercentage' | 'threeZeroCountPercentage' | 'era' | 'whip' | 'strikeoutsPerSeven'
  | 'walksPerSeven' | 'hitsAllowed' | 'walksAllowed' | 'strikeouts' | 'hitBatters' | 'wildPitches';

export const PITCHING_SEASON_COLUMNS: SeasonStatColumn<SeasonPitchingStatKey>[] = [
  { key: 'inningsPitchedOuts',         label: 'IP',    title: 'Innings pitched',                  format: 'ip' },
  { key: 'totalPitches',               label: 'PC',    title: 'Pitch count',                      format: 'int' },
  { key: 'strikePercentage',           label: 'STR%',  title: 'Strike percentage',                format: 'pct' },
  { key: 'firstPitchStrikePercentage', label: 'FPS%',  title: 'First-pitch strike percentage',    format: 'pct' },
  { key: 'threeBallCountPercentage',   label: '3B%',   title: '% of PAs with a 3-ball count',     format: 'pct' },
  { key: 'threeZeroCountPercentage',   label: '30CNT', title: '% of PAs starting with 3 straight balls (3-0 count)', format: 'pct' },
  { key: 'era',                        label: 'ERA',   title: 'Earned run average (per 7 innings)', format: 'dec' },
  { key: 'whip',                       label: 'WHIP',  title: 'Walks + hits per inning pitched',  format: 'dec' },
  { key: 'strikeoutsPerSeven',         label: 'K/7',   title: 'Strikeouts per 7 innings',         format: 'dec' },
  { key: 'walksPerSeven',              label: 'BB/7',  title: 'Walks per 7 innings',              format: 'dec' },
  { key: 'hitsAllowed',                label: 'H',     title: 'Hits allowed',                     format: 'int' },
  { key: 'walksAllowed',               label: 'BB',    title: 'Walks',                            format: 'int' },
  { key: 'strikeouts',                 label: 'K',     title: 'Strikeouts',                       format: 'int' },
  { key: 'hitBatters',                 label: 'HBP',   title: 'Hit batters',                      format: 'int' },
  { key: 'wildPitches',                label: 'WP',    title: 'Wild pitches',                     format: 'int' },
];

const PITCHING_TIER_KEYS: Record<StatTier, ReadonlySet<SeasonPitchingStatKey>> = {
  youth: new Set<SeasonPitchingStatKey>([
    'inningsPitchedOuts', 'totalPitches', 'strikePercentage', 'firstPitchStrikePercentage',
    'era', 'walksAllowed', 'strikeouts', 'wildPitches', 'hitBatters',
  ]),
  high_school: new Set<SeasonPitchingStatKey>([
    'inningsPitchedOuts', 'totalPitches', 'strikePercentage', 'firstPitchStrikePercentage',
    'threeBallCountPercentage', 'threeZeroCountPercentage', 'era', 'whip', 'strikeoutsPerSeven', 'walksPerSeven',
    'hitsAllowed', 'walksAllowed', 'strikeouts', 'hitBatters', 'wildPitches',
  ]),
  college: new Set<SeasonPitchingStatKey>(PITCHING_SEASON_COLUMNS.map((c) => c.key)),
};

/** Counting stats and ERA: what the free plan shows. */
const FREE_PITCHING_KEYS: ReadonlySet<SeasonPitchingStatKey> = new Set<SeasonPitchingStatKey>([
  'inningsPitchedOuts', 'totalPitches', 'era', 'hitsAllowed', 'walksAllowed', 'strikeouts', 'hitBatters', 'wildPitches',
]);

/** The pitching columns for a stat tier; `advanced` is the plan's ADVANCED_PITCHING_STATS feature. */
export function visiblePitchingColumns(tier: StatTier, advanced: boolean): SeasonStatColumn<SeasonPitchingStatKey>[] {
  return PITCHING_SEASON_COLUMNS.filter(
    (col) => PITCHING_TIER_KEYS[tier].has(col.key) && (advanced || FREE_PITCHING_KEYS.has(col.key)),
  );
}

type PitchingCounts = Pick<PitchingStats,
  | 'inningsPitchedOuts' | 'totalPitches' | 'strikes' | 'firstPitchStrikes' | 'totalPAs' | 'threeBallCountPAs'
  | 'threeZeroCountPAs' | 'hitsAllowed' | 'earnedRunsAllowed' | 'walksAllowed' | 'strikeouts' | 'hitBatters' | 'wildPitches'
>;

/** The totals row, rates recomputed from the summed counts (ERA: earned runs per 7 innings, like each row). */
export function pitchingTotals(rows: PitchingCounts[]): Record<SeasonPitchingStatKey, number> {
  const t = rows.reduce(
    (acc, s) => ({
      ip: acc.ip + s.inningsPitchedOuts, pc: acc.pc + s.totalPitches, str: acc.str + s.strikes,
      fps: acc.fps + s.firstPitchStrikes, tpa: acc.tpa + s.totalPAs, tb3: acc.tb3 + s.threeBallCountPAs,
      t30: acc.t30 + s.threeZeroCountPAs, h: acc.h + s.hitsAllowed, er: acc.er + s.earnedRunsAllowed,
      bb: acc.bb + s.walksAllowed, k: acc.k + s.strikeouts, hbp: acc.hbp + s.hitBatters, wp: acc.wp + s.wildPitches,
    }),
    { ip: 0, pc: 0, str: 0, fps: 0, tpa: 0, tb3: 0, t30: 0, h: 0, er: 0, bb: 0, k: 0, hbp: 0, wp: 0 },
  );
  const innings = t.ip / 3;
  return {
    inningsPitchedOuts: t.ip,
    totalPitches: t.pc,
    strikePercentage: t.pc > 0 ? t.str / t.pc : NaN,
    firstPitchStrikePercentage: t.tpa > 0 ? t.fps / t.tpa : NaN,
    threeBallCountPercentage: t.tpa > 0 ? t.tb3 / t.tpa : NaN,
    threeZeroCountPercentage: t.tpa > 0 ? t.t30 / t.tpa : NaN,
    era: innings > 0 ? (t.er * 7) / innings : NaN,
    whip: innings > 0 ? (t.bb + t.h) / innings : NaN,
    strikeoutsPerSeven: innings > 0 ? (t.k * 7) / innings : NaN,
    walksPerSeven: innings > 0 ? (t.bb * 7) / innings : NaN,
    hitsAllowed: t.h,
    walksAllowed: t.bb,
    strikeouts: t.k,
    hitBatters: t.hbp,
    wildPitches: t.wp,
  };
}

// ── Rest ────────────────────────────────────────────────────────────────────

export interface PitcherComplianceSnapshot {
  requiredRestDays: number | null;
  canPitchNextDay: boolean | null;
  /** YYYY-MM-DD of the latest pitch_counts row: that game's local day. */
  lastGameDate: string | null;
  /** IANA zone of the latest outing's game (`games.time_zone`); null when unknown. */
  timeZone?: string | null;
}

/**
 * {@link pitcherRestStatus} as of `now`, counting days the way `game_date` was
 * written: in the outing's game time zone, so a late-evening check doesn't
 * land on the next UTC day and clear a pitcher early. An unknown zone falls
 * back to the viewer's.
 */
export function pitcherRestStatusAt(
  compliance: PitcherComplianceSnapshot,
  now: Date,
): ReturnType<typeof pitcherRestStatus> {
  return pitcherRestStatus(compliance, utcToZonedDateTime(now, compliance.timeZone).date);
}

/**
 * A pitcher's rest from their latest pitch count, as of `today`
 * (YYYY-MM-DD): eligible, or the whole days of rest still owed.
 *
 * Rest days are the full days after the outing, so a pitcher owed two clears
 * on the third day (`getEligibleDate`, the Bullpen Planner's rule): after a
 * Tuesday outing, Wednesday and Thursday are rest and Friday is eligible.
 */
export function pitcherRestStatus(
  compliance: PitcherComplianceSnapshot,
  today: string,
): { eligible: true } | { eligible: false; daysRemaining: number } {
  const { requiredRestDays, canPitchNextDay, lastGameDate } = compliance;
  if (requiredRestDays == null || requiredRestDays === 0 || canPitchNextDay || !lastGameDate) return { eligible: true };
  // Both are YYYY-MM-DD, parsed as UTC midnights: whole days, no DST drift.
  const daysSinceOuting = Math.round((Date.parse(today) - Date.parse(lastGameDate)) / 86_400_000);
  const daysUntilEligible = requiredRestDays + 1 - daysSinceOuting;
  if (daysUntilEligible <= 0) return { eligible: true };
  // On the day of the outing itself, every rest day is still ahead.
  return { eligible: false, daysRemaining: Math.min(requiredRestDays, daysUntilEligible) };
}
