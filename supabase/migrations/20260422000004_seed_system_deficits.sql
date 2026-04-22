-- ============================================================================
-- Practice Engine — Tier 4 development layer
-- Migration: seed ~30 curated system deficits (visibility='system', team_id=null)
-- ============================================================================
--
-- Deterministic UUIDs via uuid_generate_v5 with a fixed namespace so
-- `supabase db reset` is idempotent. ON CONFLICT (id) DO NOTHING lets
-- re-runs (and future additive seeds) no-op cleanly. To update an existing
-- system deficit, ship a new migration with INSERT ... ON CONFLICT DO UPDATE.

do $$
declare
  -- Stable namespace for the practice deficit vocabulary.
  -- (Random v4 value picked once; never change it.)
  ns constant uuid := 'b8f1c3d4-5a6b-4c7d-8e9f-1a2b3c4d5e6f';
begin
  perform set_config(
    'search_path',
    'public, extensions, pg_temp',
    true
  );

  insert into public.practice_deficits (
    id, team_id, visibility, slug, name, description, skill_categories
  )
  select
    uuid_generate_v5(ns, 'practice-deficit:' || d.slug),
    null,
    'system',
    d.slug,
    d.name,
    d.description,
    d.skills::public.practice_skill_category[]
  from (values
    -- ═══ HITTING (12) ══════════════════════════════════════════════════════
    ('early-bat-drag',          'Early bat drag',
     'Barrel drops below the hands too early in the swing, causing under-the-ball contact and weak fly balls.',
     '{hitting}'),
    ('front-side-flies-open',   'Front side flies open',
     'Front shoulder and hip pull open before contact, losing backside power and extension through the ball.',
     '{hitting}'),
    ('steep-swing-path',        'Steep swing path',
     'Bat travels too vertically through the zone, producing high ground balls and swing-and-miss on low pitches.',
     '{hitting}'),
    ('flat-swing-path',         'Flat swing path',
     'Swing plane stays horizontal and misses the pitch plane, producing low line drives and pop-ups.',
     '{hitting}'),
    ('late-trigger',            'Late trigger',
     'Hitter starts the load and stride too late, causing late contact and lost power to the pull side.',
     '{hitting}'),
    ('weight-gets-stuck-back',  'Weight gets stuck back',
     'Hitter fails to transfer weight to the front side, losing drive and producing weak contact.',
     '{hitting}'),
    ('poor-two-strike-approach','Poor two-strike approach',
     'Hitter maintains a pull-heavy load and long swing with two strikes instead of shortening up and battling.',
     '{hitting,mental}'),
    ('struggles-vs-off-speed',  'Struggles versus off-speed',
     'Hitter commits early on off-speed pitches, producing rollovers and swings-and-misses on changeups and breaking balls.',
     '{hitting}'),
    ('no-backside-on-breaking', 'No backside on breaking balls',
     'Hitter cannot keep the barrel in the zone through a breaking ball away, producing weak pull-side contact.',
     '{hitting}'),
    ('poor-bunt-execution',     'Poor bunt execution',
     'Sacrifice or drag bunt placement is inconsistent; deadens to the pitcher or pops up rather than rolling down the line.',
     '{hitting}'),
    ('chases-out-of-zone',      'Chases out of the zone',
     'Hitter expands with two strikes or when fooled, producing low-quality at-bats and elevated strikeout rate.',
     '{hitting,mental}'),
    ('pulls-off-at-contact',    'Pulls off at contact',
     'Hitter rotates away from the baseball at contact, losing the outside part of the plate and producing weak contact.',
     '{hitting}'),

    -- ═══ PITCHING (10) ═════════════════════════════════════════════════════
    ('glove-side-command',      'Glove-side command',
     'Pitcher struggles to execute pitches to the glove-side edge, especially at the same height as target.',
     '{pitching}'),
    ('arm-side-command',        'Arm-side command',
     'Pitcher struggles to execute to the arm-side edge; fastballs drift into the middle of the plate.',
     '{pitching}'),
    ('flat-vertical-approach-angle', 'Flat vertical approach angle',
     'Fastball approaches the zone at too shallow an angle, reducing swing-and-miss at the top of the zone.',
     '{pitching}'),
    ('drops-elbow',             'Drops elbow',
     'Throwing elbow drops below the shoulder line at release, producing arm-side miss and flat breaking balls.',
     '{pitching}'),
    ('rushes-delivery',         'Rushes delivery',
     'Lower half outpaces the arm, causing the ball to release early, miss high, and leak arm-side.',
     '{pitching}'),
    ('inconsistent-release-point','Inconsistent release point',
     'Release point varies pitch-to-pitch, hurting command and tipping off hitters to pitch type.',
     '{pitching}'),
    ('no-secondary-pitch-command','No secondary pitch command',
     'Pitcher can only execute the fastball for strikes; secondary pitches land out of the zone or in the middle.',
     '{pitching}'),
    ('tips-pitches',            'Tips pitches',
     'Delivery or glove position changes between pitch types, letting hitters sit on specific pitches.',
     '{pitching}'),
    ('slow-to-plate-with-runners','Slow to the plate with runners',
     'Pitcher takes too long from first move to release, giving baserunners free steals.',
     '{pitching,team_defense}'),
    ('poor-pfp-execution',      'Poor pitcher fielding practice (PFP) execution',
     'Pitcher is slow or out of position on comebackers, bunt coverage, and covering first base.',
     '{pitching,fielding}'),

    -- ═══ FIELDING (5) ══════════════════════════════════════════════════════
    ('slow-first-step',         'Slow first step',
     'Fielder reacts late off the bat, losing range on balls to either side.',
     '{fielding}'),
    ('poor-throw-accuracy-on-the-run','Poor throw accuracy on the run',
     'Fielder loses throw accuracy when moving laterally or charging the ball.',
     '{fielding}'),
    ('rushes-transfer',         'Rushes transfer',
     'Fielder flips the ball out of the glove early, producing bobbles and errant throws to bases.',
     '{fielding}'),
    ('misreads-routes-in-outfield','Misreads routes in outfield',
     'Outfielder takes indirect routes to fly balls, losing range and catchable outs.',
     '{fielding}'),
    ('weak-backhand',           'Weak backhand',
     'Infielder struggles to secure backhand plays, producing boots and errant throws.',
     '{fielding}'),

    -- ═══ BASERUNNING / TEAM DEFENSE (3) ═══════════════════════════════════
    ('poor-secondary-leads',    'Poor secondary leads',
     'Runner fails to extend the secondary on contact, losing the ability to advance on a wild pitch or read on a ground ball.',
     '{baserunning}'),
    ('misreads-first-to-third', 'Misreads first-to-third',
     'Runner fails to read the outfielder and coach, stopping at second on a ball that should have advanced them to third.',
     '{baserunning}'),
    ('blown-bunt-coverage',     'Blown bunt coverage',
     'Defense fails to execute assigned bunt coverage, leaving bases uncovered or unattacked bunts.',
     '{team_defense,pitching}')
  ) as d(slug, name, description, skills)
  on conflict (id) do nothing;
end $$;
