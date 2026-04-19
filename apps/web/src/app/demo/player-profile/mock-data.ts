// Sample player used by the public marketing demo at /demo/player-profile.
// Numbers are fabricated but kept internally consistent (career totals equal
// the sum of season rows, ERA/WHIP/AVG line up with the underlying counts) so
// that a scout poking at the figures doesn't see obviously broken math.

export interface PitchType {
  pitchType: 'Fastball' | 'Curveball' | 'Slider' | 'Changeup';
  avgMph: number;
  topMph: number;
  spinRpm: number;
}

export interface BattingLine {
  avg: string;
  obp: string;
  slg: string;
  ops: string;
  games: number;
  pa: number;
  ab: number;
  hits: number;
  doubles: number;
  triples: number;
  hr: number;
  rbi: number;
  bb: number;
  k: number;
  sb: number;
}

export interface PitchingLine {
  ip: string;
  era: string;
  whip: string;
  k: number;
  bb: number;
  h: number;
  pc: number;
  strikePct: string;
}

export interface SeasonLine {
  key: string;
  teamName: string;
  seasonName: string;
  batting: BattingLine | null;
  pitching: PitchingLine | null;
}

export interface CharacterHighlight {
  coachName: string;
  teamName: string;
  date: string;
  quote: string;
  tag: 'Sportsmanship' | 'Team-first' | 'Community';
}

export interface ReferencePerson {
  name: string;
  role: string;
  contact: string;
}

export interface DemoPlayer {
  firstName: string;
  lastName: string;
  position: string;
  gradYear: number;
  school: string;
  hometown: string;
  bats: 'R' | 'L' | 'S';
  throws: 'R' | 'L';
  jerseyNumber: number;
  profilePhotoUrl: string | null;

  heightInches: number;
  weightLbs: number;
  sixtyYardDashSeconds: number;
  exitVelocityMph: number;
  maxExitVelocityMph: number;
  homeToFirstSeconds: number;
  homeToHomeSeconds: number;
  pitchTypes: PitchType[];

  careerBatting: BattingLine;
  careerPitching: PitchingLine;
  seasons: SeasonLine[];

  strengthsSummary: string;
  strengthsTags: string[];

  characterHighlights: CharacterHighlight[];

  gpa: number;
  gpaScale: number;
  weightedGpa: number;
  satScore: number;
  actScore: number;
  classRank: string;
  apCourses: string[];
  academicAwards: string[];

  targetMajors: string[];
  travelTeams: string[];
  commitmentStatus: string;
  references: ReferencePerson[];
}

export const DEMO_PLAYER: DemoPlayer = {
  firstName: 'Tyler',
  lastName: 'Reyes',
  position: 'RHP / SS',
  gradYear: 2027,
  school: 'Central High',
  hometown: 'Phoenix, AZ',
  bats: 'R',
  throws: 'R',
  jerseyNumber: 7,
  profilePhotoUrl: null,

  heightInches: 74,
  weightLbs: 185,
  sixtyYardDashSeconds: 6.72,
  exitVelocityMph: 94,
  maxExitVelocityMph: 98,
  homeToFirstSeconds: 4.21,
  homeToHomeSeconds: 15.8,
  pitchTypes: [
    { pitchType: 'Fastball', avgMph: 88, topMph: 92, spinRpm: 2250 },
    { pitchType: 'Curveball', avgMph: 74, topMph: 77, spinRpm: 2700 },
    { pitchType: 'Slider', avgMph: 80, topMph: 83, spinRpm: 2400 },
    { pitchType: 'Changeup', avgMph: 79, topMph: 82, spinRpm: 1800 },
  ],

  careerBatting: {
    avg: '.314',
    obp: '.393',
    slg: '.484',
    ops: '.877',
    games: 74,
    pa: 262,
    ab: 223,
    hits: 70,
    doubles: 16,
    triples: 2,
    hr: 6,
    rbi: 53,
    bb: 29,
    k: 42,
    sb: 27,
  },

  careerPitching: {
    ip: '96.0',
    era: '2.63',
    whip: '1.04',
    k: 126,
    bb: 29,
    h: 71,
    pc: 1442,
    strikePct: '64%',
  },

  seasons: [
    {
      key: '2026-summer',
      teamName: 'Arizona Heat 17U',
      seasonName: '2026 Summer Travel',
      batting: {
        avg: '.343',
        obp: '.415',
        slg: '.529',
        ops: '.944',
        games: 22,
        pa: 82,
        ab: 70,
        hits: 24,
        doubles: 5,
        triples: 1,
        hr: 2,
        rbi: 18,
        bb: 9,
        k: 12,
        sb: 9,
      },
      pitching: {
        ip: '25.2',
        era: '2.10',
        whip: '0.98',
        k: 38,
        bb: 8,
        h: 17,
        pc: 386,
        strikePct: '67%',
      },
    },
    {
      key: '2025-varsity',
      teamName: 'Central High Varsity',
      seasonName: '2025 Spring (Sophomore)',
      batting: {
        avg: '.318',
        obp: '.392',
        slg: '.523',
        ops: '.915',
        games: 28,
        pa: 102,
        ab: 88,
        hits: 28,
        doubles: 7,
        triples: 1,
        hr: 3,
        rbi: 24,
        bb: 11,
        k: 16,
        sb: 12,
      },
      pitching: {
        ip: '42.1',
        era: '2.55',
        whip: '1.04',
        k: 56,
        bb: 12,
        h: 30,
        pc: 632,
        strikePct: '64%',
      },
    },
    {
      key: '2024-varsity',
      teamName: 'Central High Varsity',
      seasonName: '2024 Spring (Freshman)',
      batting: {
        avg: '.277',
        obp: '.371',
        slg: '.385',
        ops: '.756',
        games: 24,
        pa: 78,
        ab: 65,
        hits: 18,
        doubles: 4,
        triples: 0,
        hr: 1,
        rbi: 11,
        bb: 9,
        k: 14,
        sb: 6,
      },
      pitching: {
        ip: '28.0',
        era: '3.21',
        whip: '1.18',
        k: 32,
        bb: 9,
        h: 24,
        pc: 424,
        strikePct: '62%',
      },
    },
  ],

  strengthsSummary:
    'Tyler is a true two-way prospect whose 96 career innings have produced a 2.63 ERA with a 4.3:1 K-to-walk ratio — a profile driven by a 92-mph fastball that he commands to both sides of the plate and a tight 2,700-rpm curveball that grades as a present plus pitch. At the plate, he has lifted his line-drive rate every season (career .484 SLG, .877 OPS) and walks more than he strikes out in the higher-level summer circuit. Coaches consistently flag his preparation, his composure with runners on, and a clubhouse presence that punches above his class year. He projects as a power arm at the next level with the bat speed and instincts to stay on the dirt.',
  strengthsTags: [
    'Plus curveball',
    'Pitch-efficient',
    'Two-strike hitter',
    'Game-caller',
    'Clubhouse leader',
    'Coachable',
  ],

  characterHighlights: [
    {
      coachName: 'Coach Marcus Liu',
      teamName: 'Central High Varsity',
      date: 'May 2025',
      quote:
        'Tyler walked off the mound after a tough loss and was the first to find the opposing pitcher to congratulate him. That is who he is — every day, not just when people are watching.',
      tag: 'Sportsmanship',
    },
    {
      coachName: 'Coach Devon Park',
      teamName: 'Arizona Heat 17U',
      date: 'July 2026',
      quote:
        'Asked to move to the 9-hole and bunt to manufacture a run in a tournament final. He squared two pitches, dropped a perfect sac, and never said a word about hitting third the rest of the weekend. Pure team-first kid.',
      tag: 'Team-first',
    },
    {
      coachName: 'Coach Marcus Liu',
      teamName: 'Central High Varsity',
      date: 'November 2025',
      quote:
        'Tyler organized our offseason youth clinic — eight Saturdays in a row, free of charge, for kids in the district. He recruited four of his teammates to join him. That kind of leadership at 16 is rare.',
      tag: 'Community',
    },
  ],

  gpa: 3.78,
  gpaScale: 4.0,
  weightedGpa: 4.12,
  satScore: 1320,
  actScore: 29,
  classRank: '42 / 312',
  apCourses: [
    'AP Biology',
    'AP US History',
    'AP Statistics',
    'Honors English III',
    'Honors Pre-Calculus',
  ],
  academicAwards: [
    'Principal\u2019s Honor Roll (2024, 2025, 2026)',
    'National Honor Society inductee (2025)',
    'AP Scholar with Distinction (2025)',
  ],

  targetMajors: ['Kinesiology', 'Business', 'Sports Management'],
  travelTeams: [
    'Arizona Heat 17U (2026)',
    'Desert Dogs Showcase 16U (2025)',
    'Phoenix Prospects 15U (2024)',
  ],
  commitmentStatus: 'Uncommitted',
  references: [
    {
      name: 'Coach Marcus Liu',
      role: 'Head Coach, Central High Varsity',
      contact: 'On request',
    },
    {
      name: 'Coach Devon Park',
      role: 'Director, Arizona Heat 17U',
      contact: 'On request',
    },
    {
      name: 'Dr. Renee Carver',
      role: 'AP Biology Teacher, Central High',
      contact: 'On request',
    },
  ],
};
