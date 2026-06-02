export type StatSubject = 'player' | 'team';
export type SortDir = 'asc' | 'desc'; // asc = lower is better (ERA, WHIP)
export type QualifierKind = 'none' | 'pa' | 'ip';
/** Category a stat belongs to — drives the league-home leaderboard tabs. */
export type StatGroup = 'batting' | 'pitching' | 'team' | 'special';

export interface StatDef {
  key: string;
  label: string;
  subject: StatSubject;
  sortDir: SortDir;
  isRate: boolean;
  qualifier: QualifierKind; // which minimum applies on rate boards
  /** dot-path into the snapshot stat row (player or team) */
  field: string;
  /** display formatter id */
  format: 'avg3' | 'int' | 'pct1' | 'ip' | 'ratio2';
  /** category for the league-home leaderboard tabs */
  group: StatGroup;
}

export const STAT_CATALOG: readonly StatDef[] = [
  // Batting (player)
  { key: 'avg',        label: 'AVG',        subject: 'player', sortDir: 'desc', isRate: true,  qualifier: 'pa',   field: 'avg',         format: 'avg3',   group: 'batting'  },
  { key: 'obp',        label: 'OBP',        subject: 'player', sortDir: 'desc', isRate: true,  qualifier: 'pa',   field: 'obp',         format: 'avg3',   group: 'batting'  },
  { key: 'slg',        label: 'SLG',        subject: 'player', sortDir: 'desc', isRate: true,  qualifier: 'pa',   field: 'slg',         format: 'avg3',   group: 'batting'  },
  { key: 'ops',        label: 'OPS',        subject: 'player', sortDir: 'desc', isRate: true,  qualifier: 'pa',   field: 'ops',         format: 'avg3',   group: 'batting'  },
  { key: 'homeRuns',   label: 'HR',         subject: 'player', sortDir: 'desc', isRate: false, qualifier: 'none', field: 'homeRuns',    format: 'int',    group: 'batting'  },
  { key: 'rbi',        label: 'RBI',        subject: 'player', sortDir: 'desc', isRate: false, qualifier: 'none', field: 'rbi',         format: 'int',    group: 'batting'  },
  { key: 'hits',       label: 'H',          subject: 'player', sortDir: 'desc', isRate: false, qualifier: 'none', field: 'hits',        format: 'int',    group: 'batting'  },
  { key: 'runs',       label: 'R',          subject: 'player', sortDir: 'desc', isRate: false, qualifier: 'none', field: 'runs',        format: 'int',    group: 'batting'  },
  { key: 'doubles',    label: '2B',         subject: 'player', sortDir: 'desc', isRate: false, qualifier: 'none', field: 'doubles',     format: 'int',    group: 'special'  },
  { key: 'triples',    label: '3B',         subject: 'player', sortDir: 'desc', isRate: false, qualifier: 'none', field: 'triples',     format: 'int',    group: 'batting'  },
  { key: 'walks',      label: 'BB',         subject: 'player', sortDir: 'desc', isRate: false, qualifier: 'none', field: 'walks',       format: 'int',    group: 'batting'  },
  { key: 'qabPct',     label: 'QAB%',       subject: 'player', sortDir: 'desc', isRate: true,  qualifier: 'pa',   field: 'qabPct',      format: 'pct1',   group: 'special'  },
  { key: 'hardHitPct', label: 'Hard-Hit%',  subject: 'player', sortDir: 'desc', isRate: true,  qualifier: 'pa',   field: 'hardHitPct',  format: 'pct1',   group: 'special'  },
  // Pitching (player)
  { key: 'era',        label: 'ERA',        subject: 'player', sortDir: 'asc',  isRate: true,  qualifier: 'ip',   field: 'era',         format: 'ratio2', group: 'pitching' },
  { key: 'whip',       label: 'WHIP',       subject: 'player', sortDir: 'asc',  isRate: true,  qualifier: 'ip',   field: 'whip',        format: 'ratio2', group: 'pitching' },
  { key: 'strikeoutsP',label: 'K (P)',      subject: 'player', sortDir: 'desc', isRate: false, qualifier: 'none', field: 'strikeoutsP', format: 'int',    group: 'pitching' },
  // Team
  { key: 'teamAvg',    label: 'Team AVG',   subject: 'team',   sortDir: 'desc', isRate: true,  qualifier: 'none', field: 'teamAvg',     format: 'avg3',   group: 'team'     },
  { key: 'teamEra',    label: 'Team ERA',   subject: 'team',   sortDir: 'asc',  isRate: true,  qualifier: 'none', field: 'teamEra',     format: 'ratio2', group: 'team'     },
  { key: 'runsScored', label: 'Runs Scored',subject: 'team',   sortDir: 'desc', isRate: false, qualifier: 'none', field: 'runsScored',  format: 'int',    group: 'team'     },
  { key: 'runDiff',    label: 'Run Diff',   subject: 'team',   sortDir: 'desc', isRate: false, qualifier: 'none', field: 'runDiff',     format: 'int',    group: 'team'     },
] as const;

export type StatKey = (typeof STAT_CATALOG)[number]['key'];

const BY_KEY = new Map(STAT_CATALOG.map((s) => [s.key, s]));

export function getStatDef(key: StatKey): StatDef {
  const def = BY_KEY.get(key);
  if (!def) throw new Error(`Unknown stat key: ${key}`);
  return def;
}
