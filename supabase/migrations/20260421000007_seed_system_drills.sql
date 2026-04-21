-- ============================================================================
-- Practice Engine — Tier 1 MVP
-- Migration 7: seed ~120 curated system drills (visibility='system', team_id=null)
-- ============================================================================
--
-- Deterministic UUIDs via uuid_generate_v5 with a fixed namespace so
-- `supabase db reset` is idempotent. ON CONFLICT (id) DO NOTHING lets
-- re-runs (and future additive seeds) no-op cleanly. To update an existing
-- system drill, ship a new migration with INSERT ... ON CONFLICT DO UPDATE.

-- Stable namespace for the practice drill library.
-- (Random v4 value picked once; never change it.)
-- 7a6b5c1d-2e3f-4a5b-8c7d-6e5f4a3b2c1d
do $$
declare
  ns constant uuid := '7a6b5c1d-2e3f-4a5b-8c7d-6e5f4a3b2c1d';
begin
  insert into public.practice_drills (
    id, team_id, visibility, name, description, default_duration_minutes,
    skill_categories, positions, age_levels, equipment, field_spaces,
    min_players, max_players, coaching_points, tags, source
  )
  select
    uuid_generate_v5(ns, 'practice-drill:' || d.slug),
    null,
    'system',
    d.name,
    d.description,
    d.duration,
    d.skills,
    d.positions,
    d.ages,
    d.equipment,
    d.spaces,
    d.min_p,
    d.max_p,
    d.coaching_points,
    d.tags,
    'BaseballCoachesApp curated library'
  from (values
    -- ═══ HITTING (30) ═══════════════════════════════════════════════════════
    ('tee-work-basic', 'Tee Work: Basic Swing',
     'Place ball on tee middle-middle; hitter takes 10 controlled swings focusing on balance, contact, and finish.', 12,
     '{hitting}'::public.practice_skill_category[], '{}'::text[], '{all}'::public.practice_age_level[],
     '{tees,baseballs,bat,helmet,nets}'::public.practice_equipment[], '{cage_1}'::public.practice_field_space[],
     1, 6, '• Feet shoulder-width, slight knee bend' || E'\n' || '• Hands to the ball, not out front' || E'\n' || '• Balanced finish — hold posture after contact', '{fundamentals,warmup}'::text[]),

    ('tee-work-inside', 'Tee Work: Inside Pitch',
     'Tee on inside third of plate; hitter works to pull the ball with hands inside the ball.', 10,
     '{hitting}'::public.practice_skill_category[], '{}'::text[], '{all}'::public.practice_age_level[],
     '{tees,baseballs,bat,helmet,nets}'::public.practice_equipment[], '{cage_1}'::public.practice_field_space[],
     1, 6, '• Hands stay close to body' || E'\n' || '• Clear the hip early' || E'\n' || '• Finish pull side', '{pull,inside}'::text[]),

    ('tee-work-outside', 'Tee Work: Outside Pitch',
     'Tee set to the outside third; hitter drives ball to opposite field keeping the barrel in the zone.', 10,
     '{hitting}'::public.practice_skill_category[], '{}'::text[], '{all}'::public.practice_age_level[],
     '{tees,baseballs,bat,helmet,nets}'::public.practice_equipment[], '{cage_1}'::public.practice_field_space[],
     1, 6, '• Let the ball travel' || E'\n' || '• Direct barrel through back of ball' || E'\n' || '• Stay through the middle', '{oppo,outside}'::text[]),

    ('tee-work-high', 'Tee Work: High Strike',
     'Tee raised to upper third of the zone; hitter keeps barrel level and drives high pitch.', 8,
     '{hitting}'::public.practice_skill_category[], '{}'::text[], '{all}'::public.practice_age_level[],
     '{tees,baseballs,bat,helmet,nets}'::public.practice_equipment[], '{cage_1}'::public.practice_field_space[],
     1, 6, '• Match plane — do not uppercut' || E'\n' || '• Chest stays over hips', '{high-pitch}'::text[]),

    ('tee-work-low', 'Tee Work: Low Strike',
     'Tee at knee height; hitter lowers back hip and drives the low pitch line drive.', 8,
     '{hitting}'::public.practice_skill_category[], '{}'::text[], '{all}'::public.practice_age_level[],
     '{tees,baseballs,bat,helmet,nets}'::public.practice_equipment[], '{cage_1}'::public.practice_field_space[],
     1, 6, '• Back knee flexes to ball' || E'\n' || '• Eyes stay level', '{low-pitch}'::text[]),

    ('front-toss', 'Front Toss',
     'Coach tosses from ~15ft behind L-screen; hitter reads and drives. 2 rounds of 8.', 15,
     '{hitting}'::public.practice_skill_category[], '{}'::text[], '{all}'::public.practice_age_level[],
     '{baseballs,bat,helmet,l_screen,nets}'::public.practice_equipment[], '{cage_1,cage_2}'::public.practice_field_space[],
     2, 8, '• Short stride, quick hands' || E'\n' || '• Use the whole field' || E'\n' || '• Pick pitches', '{toss,timing}'::text[]),

    ('side-toss', 'Side Toss',
     'Coach kneels 45° to hitter and tosses underhand; hitter drives line drives up the middle.', 12,
     '{hitting}'::public.practice_skill_category[], '{}'::text[], '{all}'::public.practice_age_level[],
     '{baseballs,bat,helmet,nets}'::public.practice_equipment[], '{cage_1,cage_2}'::public.practice_field_space[],
     1, 6, '• Hitter square to net, not toss' || E'\n' || '• Back side through the ball', '{toss}'::text[]),

    ('high-tee-low-tee', 'Two-Tee Drill',
     'Two tees at different heights; hitter reads the one that is loaded with ball and drives it.', 12,
     '{hitting}'::public.practice_skill_category[], '{}'::text[], '{all}'::public.practice_age_level[],
     '{tees,baseballs,bat,helmet,nets}'::public.practice_equipment[], '{cage_1}'::public.practice_field_space[],
     1, 4, '• Barrel adjusts late' || E'\n' || '• Keep head still', '{plane,adjust}'::text[]),

    ('one-hand-drill', 'One-Hand Drill',
     'Alternate rounds with top hand only and bottom hand only off a tee. Teaches isolated strength and path.', 10,
     '{hitting}'::public.practice_skill_category[], '{}'::text[], '{all}'::public.practice_age_level[],
     '{tees,baseballs,bat,helmet,nets}'::public.practice_equipment[], '{cage_1}'::public.practice_field_space[],
     1, 4, '• Short bat helps control' || E'\n' || '• Do not overswing', '{mechanics}'::text[]),

    ('pvc-bat', 'PVC/Broomstick Hitting',
     'Hitter swings a thin dowel at small balls (wiffles) off tee or toss; exaggerates precision contact.', 10,
     '{hitting}'::public.practice_skill_category[], '{}'::text[], '{all}'::public.practice_age_level[],
     '{tees,baseballs,nets,helmet}'::public.practice_equipment[], '{cage_1}'::public.practice_field_space[],
     1, 4, '• Smaller margin for error trains the eye', '{vision,small-ball}'::text[]),

    ('rapid-fire-toss', 'Rapid-Fire Soft Toss',
     'Coach feeds quickly; hitter resets stance between each. Trains load-rhythm and recovery.', 10,
     '{hitting}'::public.practice_skill_category[], '{}'::text[], '{12u,14u,high_school_jv,high_school_varsity,college,adult}'::public.practice_age_level[],
     '{baseballs,bat,helmet,nets}'::public.practice_equipment[], '{cage_1}'::public.practice_field_space[],
     1, 4, '• Reset feet between reps' || E'\n' || '• Controlled aggression', '{tempo}'::text[]),

    ('live-arm-bp', 'Live Arm BP',
     'Player-pitcher or coach throws from behind screen ~45ft. 2 rounds of 7-8 pitches.', 18,
     '{hitting}'::public.practice_skill_category[], '{}'::text[], '{all}'::public.practice_age_level[],
     '{baseballs,bat,helmet,l_screen}'::public.practice_equipment[], '{infield,cage_1}'::public.practice_field_space[],
     2, 10, '• Read release, not windup' || E'\n' || '• Attack in the zone', '{bp,timing}'::text[]),

    ('bucket-bp', 'Bucket BP',
     'Coach throws from L-screen using a full bucket; station-style with rotation.', 20,
     '{hitting}'::public.practice_skill_category[], '{}'::text[], '{all}'::public.practice_age_level[],
     '{baseballs,bat,helmet,l_screen}'::public.practice_equipment[], '{infield,outfield}'::public.practice_field_space[],
     3, 12, '• Rotate every 8-10 swings' || E'\n' || '• Shaggers stay alert', '{bp,rotation}'::text[]),

    ('bunt-sacrifice', 'Sacrifice Bunt',
     'Players practice square-around sacrifice bunts placed down first/third base line.', 10,
     '{hitting}'::public.practice_skill_category[], '{}'::text[], '{all}'::public.practice_age_level[],
     '{baseballs,bat,helmet}'::public.practice_equipment[], '{infield}'::public.practice_field_space[],
     2, 8, '• Level barrel, bend knees' || E'\n' || '• Catch the ball with the bat', '{bunt,smallball}'::text[]),

    ('bunt-drag', 'Drag Bunt',
     'Lefty practices drag bunt toward 2B side; righty practices push bunt toward 1B side. Emphasize quick feet.', 10,
     '{hitting}'::public.practice_skill_category[], '{}'::text[], '{high_school_jv,high_school_varsity,college,adult}'::public.practice_age_level[],
     '{baseballs,bat,helmet}'::public.practice_equipment[], '{infield}'::public.practice_field_space[],
     2, 8, '• Hide the bunt until late' || E'\n' || '• Run through the ball', '{bunt,speed}'::text[]),

    ('bunt-push', 'Push Bunt',
     'Hitter fakes away, pushes a harder bunt past the pitcher toward 2B. Works on placement and deception.', 10,
     '{hitting,baserunning}'::public.practice_skill_category[], '{}'::text[], '{high_school_jv,high_school_varsity,college,adult}'::public.practice_age_level[],
     '{baseballs,bat,helmet}'::public.practice_equipment[], '{infield}'::public.practice_field_space[],
     2, 8, '• Firm bat, don''t deaden the ball' || E'\n' || '• Place past P, short of 2B', '{bunt,situational}'::text[]),

    ('hit-and-run', 'Hit-and-Run Contact',
     'Runner goes on pitch; hitter must make contact and hit behind the runner. Situational BP.', 15,
     '{hitting,baserunning}'::public.practice_skill_category[], '{}'::text[], '{14u,high_school_jv,high_school_varsity,college,adult}'::public.practice_age_level[],
     '{baseballs,bat,helmet,bases,l_screen}'::public.practice_equipment[], '{full_field}'::public.practice_field_space[],
     4, 14, '• Contact over power' || E'\n' || '• Hit the ball on the ground to the opposite side', '{situational}'::text[]),

    ('opposite-field', 'Opposite Field BP',
     'Dedicated round: every swing must go oppo. Teaches pitch recognition and staying through the ball.', 10,
     '{hitting}'::public.practice_skill_category[], '{}'::text[], '{all}'::public.practice_age_level[],
     '{baseballs,bat,helmet,l_screen,nets}'::public.practice_equipment[], '{cage_1,cage_2,infield}'::public.practice_field_space[],
     1, 6, '• Let it travel' || E'\n' || '• Inside path to outside pitch', '{oppo,approach}'::text[]),

    ('situational-bp', 'Situational BP',
     'Coach calls a runner/out scenario before each pitch; hitter executes the correct approach.', 20,
     '{hitting,baserunning,mental}'::public.practice_skill_category[], '{}'::text[], '{high_school_jv,high_school_varsity,college,adult}'::public.practice_age_level[],
     '{baseballs,bat,helmet,bases,l_screen}'::public.practice_equipment[], '{full_field}'::public.practice_field_space[],
     6, 16, '• Call situation loud' || E'\n' || '• Hitter verbalizes approach', '{situational,gameplay}'::text[]),

    ('two-strike', 'Two-Strike Approach',
     'Hitter widens stance slightly, chokes up; BP or toss focusing on fouling off tough pitches.', 10,
     '{hitting,mental}'::public.practice_skill_category[], '{}'::text[], '{12u,14u,high_school_jv,high_school_varsity,college,adult}'::public.practice_age_level[],
     '{baseballs,bat,helmet,l_screen,nets}'::public.practice_equipment[], '{cage_1}'::public.practice_field_space[],
     1, 6, '• Protect the zone' || E'\n' || '• Foul off pitches you can''t drive', '{approach,mentality}'::text[]),

    ('noodle-drill', 'Pool Noodle Drill',
     'Coach holds a pool noodle along inside half; hitter must stay inside it and go oppo.', 10,
     '{hitting}'::public.practice_skill_category[], '{}'::text[], '{all}'::public.practice_age_level[],
     '{baseballs,bat,helmet,nets}'::public.practice_equipment[], '{cage_1}'::public.practice_field_space[],
     1, 4, '• Path stays short and inside' || E'\n' || '• Barrel out late', '{mechanics,path}'::text[]),

    ('heavy-ball-tee', 'Heavy-Ball Tee',
     'Weighted training balls off a tee; teaches hitter to stay through contact without collapsing.', 8,
     '{hitting,conditioning}'::public.practice_skill_category[], '{}'::text[], '{high_school_jv,high_school_varsity,college,adult}'::public.practice_age_level[],
     '{tees,bat,helmet,nets,weights}'::public.practice_equipment[], '{cage_1}'::public.practice_field_space[],
     1, 3, '• Fewer reps, quality over quantity' || E'\n' || '• Do not overswing', '{strength}'::text[]),

    ('small-ball-tee', 'Small-Ball Tee',
     'Tee work with golf balls or small wiffles; trains precise barrel control.', 8,
     '{hitting}'::public.practice_skill_category[], '{}'::text[], '{12u,14u,high_school_jv,high_school_varsity,college,adult}'::public.practice_age_level[],
     '{tees,bat,helmet,nets}'::public.practice_equipment[], '{cage_1}'::public.practice_field_space[],
     1, 4, '• Focus, focus, focus', '{precision}'::text[]),

    ('short-bat', 'Short-Bat Hitting',
     'Hitter uses a short fungo or training bat; BP or toss. Forces tight mechanics.', 10,
     '{hitting}'::public.practice_skill_category[], '{}'::text[], '{all}'::public.practice_age_level[],
     '{bat,baseballs,helmet,nets}'::public.practice_equipment[], '{cage_1}'::public.practice_field_space[],
     1, 4, '• Hands in tight' || E'\n' || '• Do not reach', '{mechanics}'::text[]),

    ('mirror-swing', 'Mirror Swing',
     'Hitter takes dry swings in front of mirror or reflective glass; self-checks posture and path.', 8,
     '{hitting,mental}'::public.practice_skill_category[], '{}'::text[], '{all}'::public.practice_age_level[],
     '{bat}'::public.practice_equipment[], '{classroom,gym}'::public.practice_field_space[],
     1, 6, '• Slow reps at first' || E'\n' || '• Video if available', '{mechanics,focus}'::text[]),

    ('weighted-bat-warmup', 'Weighted Bat Warmup',
     'Hitter takes 5-10 swings with a weighted bat or donut then transitions to game bat.', 5,
     '{hitting,conditioning}'::public.practice_skill_category[], '{}'::text[], '{high_school_jv,high_school_varsity,college,adult}'::public.practice_age_level[],
     '{bat,weights}'::public.practice_equipment[], '{open_space}'::public.practice_field_space[],
     1, 6, '• Light effort only — warmup, not strength', '{warmup}'::text[]),

    ('rhythm-timing', 'Rhythm and Timing',
     'Coach uses a cadence count; hitters take dry swings (or soft toss) to the count. Trains pre-pitch rhythm.', 10,
     '{hitting,mental}'::public.practice_skill_category[], '{}'::text[], '{all}'::public.practice_age_level[],
     '{bat}'::public.practice_equipment[], '{open_space,gym}'::public.practice_field_space[],
     1, 8, '• Stay moving before the pitch' || E'\n' || '• Tempo wins timing', '{rhythm}'::text[]),

    ('load-separate', 'Load-and-Separate',
     'Hitter isolates load phase: hands back as front foot lifts. Dry reps then light toss.', 10,
     '{hitting}'::public.practice_skill_category[], '{}'::text[], '{all}'::public.practice_age_level[],
     '{bat,baseballs,nets,helmet}'::public.practice_equipment[], '{cage_1,open_space}'::public.practice_field_space[],
     1, 4, '• Hands move opposite the stride', '{mechanics}'::text[]),

    ('walk-through-swing', 'Walk-Through Swing',
     'Hitter walks into the swing to feel weight transfer. Trains lower-half timing.', 10,
     '{hitting}'::public.practice_skill_category[], '{}'::text[], '{all}'::public.practice_age_level[],
     '{bat,baseballs,nets,helmet}'::public.practice_equipment[], '{cage_1}'::public.practice_field_space[],
     1, 4, '• Slow, smooth walk' || E'\n' || '• Land ready to swing', '{mechanics,timing}'::text[]),

    ('bp-rounds', 'Round-Robin BP',
     'Stations: tee, toss, live BP. Groups rotate every 8 swings.', 30,
     '{hitting}'::public.practice_skill_category[], '{}'::text[], '{all}'::public.practice_age_level[],
     '{baseballs,bat,helmet,tees,nets,l_screen}'::public.practice_equipment[], '{cage_1,cage_2,infield}'::public.practice_field_space[],
     4, 14, '• Quick rotations' || E'\n' || '• Coaches own each station', '{bp,rotation}'::text[]),

    -- ═══ PITCHING (25) ═════════════════════════════════════════════════════
    ('long-toss', 'Long Toss Warmup',
     'Progressive long toss starting at 30ft, extending to max distance, then pulling in.', 15,
     '{pitching,conditioning}'::public.practice_skill_category[], '{P}'::text[], '{all}'::public.practice_age_level[],
     '{baseballs}'::public.practice_equipment[], '{outfield,open_space}'::public.practice_field_space[],
     2, 12, '• Stay tall and loose' || E'\n' || '• Pull down last 5 minutes', '{warmup,arm-care}'::text[]),

    ('towel-drill', 'Towel Drill',
     'Pitcher simulates delivery holding a towel; coach holds target. No ball; focus on extension.', 10,
     '{pitching}'::public.practice_skill_category[], '{P}'::text[], '{all}'::public.practice_age_level[],
     '{}'::public.practice_equipment[], '{open_space,bullpen_1,bullpen_2,gym}'::public.practice_field_space[],
     1, 6, '• Towel ends at target' || E'\n' || '• Full follow-through', '{mechanics}'::text[]),

    ('dry-mechanics', 'Dry Mechanics',
     'Pitcher cycles through delivery without ball, stopping at checkpoints (leg lift, balance, foot strike).', 10,
     '{pitching,mental}'::public.practice_skill_category[], '{P}'::text[], '{all}'::public.practice_age_level[],
     '{}'::public.practice_equipment[], '{open_space,gym}'::public.practice_field_space[],
     1, 6, '• Freeze positions to build feel', '{mechanics}'::text[]),

    ('balance-point', 'Balance Point',
     'Pitcher holds balance point for 3 seconds before completing delivery. Builds core stability.', 8,
     '{pitching,conditioning}'::public.practice_skill_category[], '{P}'::text[], '{all}'::public.practice_age_level[],
     '{baseballs}'::public.practice_equipment[], '{bullpen_1,bullpen_2,open_space}'::public.practice_field_space[],
     1, 6, '• No sway during the hold', '{balance}'::text[]),

    ('knee-pitching', 'Knee Pitching',
     'From one-knee position, pitcher focuses on upper-half mechanics: arm action and release.', 10,
     '{pitching}'::public.practice_skill_category[], '{P}'::text[], '{all}'::public.practice_age_level[],
     '{baseballs}'::public.practice_equipment[], '{bullpen_1,bullpen_2,open_space}'::public.practice_field_space[],
     1, 4, '• Chest stays tall' || E'\n' || '• Release over front knee', '{arm-action}'::text[]),

    ('flip-drill', 'Hip Flip Drill',
     'Pitcher works hip rotation by stepping over a cone or towel with back leg. Short throws.', 8,
     '{pitching,conditioning}'::public.practice_skill_category[], '{P}'::text[], '{all}'::public.practice_age_level[],
     '{baseballs,cones}'::public.practice_equipment[], '{bullpen_1,bullpen_2,open_space}'::public.practice_field_space[],
     1, 4, '• Hips lead the arm', '{hips,rotation}'::text[]),

    ('figure-eight', 'Figure-Eight Arm Warmup',
     'Pitcher traces figure-eight with throwing arm; opens shoulders and engages scap.', 5,
     '{pitching,conditioning}'::public.practice_skill_category[], '{P}'::text[], '{all}'::public.practice_age_level[],
     '{}'::public.practice_equipment[], '{open_space}'::public.practice_field_space[],
     1, 12, '• Full range of motion', '{warmup,arm-care}'::text[]),

    ('j-band-warmup', 'J-Band Shoulder Warmup',
     'Standard J-Band / Jaeger routine: rows, pulls, external rotations.', 8,
     '{pitching,conditioning}'::public.practice_skill_category[], '{P}'::text[], '{high_school_jv,high_school_varsity,college,adult}'::public.practice_age_level[],
     '{}'::public.practice_equipment[], '{open_space,gym}'::public.practice_field_space[],
     1, 12, '• Control — don''t snap the bands', '{arm-care,prehab}'::text[]),

    ('bullpen-fastball', 'Fastball Bullpen',
     'Pitcher throws 25-30 fastballs to catcher at varied locations. Focus: strike 1, downhill plane.', 15,
     '{pitching}'::public.practice_skill_category[], '{P,C}'::text[], '{all}'::public.practice_age_level[],
     '{baseballs,catchers_gear}'::public.practice_equipment[], '{bullpen_1,bullpen_2}'::public.practice_field_space[],
     2, 3, '• Strike 1 is mandatory' || E'\n' || '• Hit spots — don''t aim', '{bullpen}'::text[]),

    ('bullpen-mix', 'Mixed-Pitch Bullpen',
     'Pitcher throws a mix: fastball, off-speed, breaking. Works sequence and release consistency.', 20,
     '{pitching}'::public.practice_skill_category[], '{P,C}'::text[], '{14u,high_school_jv,high_school_varsity,college,adult}'::public.practice_age_level[],
     '{baseballs,catchers_gear}'::public.practice_equipment[], '{bullpen_1,bullpen_2}'::public.practice_field_space[],
     2, 3, '• Same arm slot for every pitch' || E'\n' || '• Call your own sequence', '{bullpen,mix}'::text[]),

    ('hitters-eye', 'Hitter''s Eye',
     'Live batter stands in, no swing. Pitcher works through sequence vs. a real batter.', 15,
     '{pitching,mental}'::public.practice_skill_category[], '{P,C}'::text[], '{14u,high_school_jv,high_school_varsity,college,adult}'::public.practice_age_level[],
     '{baseballs,catchers_gear,bat,helmet}'::public.practice_equipment[], '{bullpen_1,bullpen_2}'::public.practice_field_space[],
     3, 4, '• Hitter takes no swings', '{bullpen,simulation}'::text[]),

    ('location-game', '4-Corner Location Game',
     'Target drawn into 4 quadrants; pitcher calls corner before each pitch. 2 points for hit, 0 for miss.', 15,
     '{pitching}'::public.practice_skill_category[], '{P,C}'::text[], '{all}'::public.practice_age_level[],
     '{baseballs,catchers_gear}'::public.practice_equipment[], '{bullpen_1,bullpen_2}'::public.practice_field_space[],
     2, 4, '• Make the stakes real — compete', '{bullpen,competition}'::text[]),

    ('stretch-bullpen', 'Stretch Bullpen',
     'Bullpen entirely from the stretch. Focus on quick times and controlling the run game.', 12,
     '{pitching}'::public.practice_skill_category[], '{P,C}'::text[], '{all}'::public.practice_age_level[],
     '{baseballs,catchers_gear}'::public.practice_equipment[], '{bullpen_1,bullpen_2}'::public.practice_field_space[],
     2, 3, '• Slide step selectively' || E'\n' || '• Home to glove under 1.4s', '{bullpen,stretch}'::text[]),

    ('pickoff-first', 'Pickoff to First',
     'Pitcher practices pickoff to 1B: inside move, jump turn, step-off. Varied looks.', 10,
     '{pitching,team_defense}'::public.practice_skill_category[], '{P,1B}'::text[], '{all}'::public.practice_age_level[],
     '{baseballs,bases}'::public.practice_equipment[], '{infield}'::public.practice_field_space[],
     2, 6, '• Sell the move' || E'\n' || '• Quick feet, balanced throw', '{pickoff}'::text[]),

    ('pickoff-second', 'Pickoff to Second',
     'Inside and outside moves to 2B with middle-IF coverage. Signals from catcher or verbal call.', 10,
     '{pitching,team_defense}'::public.practice_skill_category[], '{P,2B,SS}'::text[], '{14u,high_school_jv,high_school_varsity,college,adult}'::public.practice_age_level[],
     '{baseballs,bases}'::public.practice_equipment[], '{infield}'::public.practice_field_space[],
     3, 6, '• Time sign-to-throw' || E'\n' || '• MIF must be moving', '{pickoff,middle}'::text[]),

    ('pfps', 'PFPs (Pitchers Fielding Practice)',
     'Comebackers, bunt coverage, cover 1st on ground ball to right side. Coach hits fungo sequence.', 15,
     '{pitching,team_defense,fielding}'::public.practice_skill_category[], '{P,1B,2B,SS,3B,C}'::text[], '{all}'::public.practice_age_level[],
     '{baseballs,bases,bat}'::public.practice_equipment[], '{infield,full_field}'::public.practice_field_space[],
     5, 12, '• Glove side always ready' || E'\n' || '• Communicate on bunts', '{pfp,fielding}'::text[]),

    ('comebackers', 'Comebacker Drill',
     'Coach rolls or hits balls back to pitcher; pitcher turns and throws to 2B, 3B, or home.', 10,
     '{pitching,fielding}'::public.practice_skill_category[], '{P}'::text[], '{all}'::public.practice_age_level[],
     '{baseballs,bases,bat}'::public.practice_equipment[], '{infield}'::public.practice_field_space[],
     2, 6, '• Balance first, throw second', '{pfp}'::text[]),

    ('bunt-cover-p', 'Pitcher Bunt Coverage',
     'Pitcher fields bunts down both lines, makes correct throw. Coach calls the side.', 10,
     '{pitching,team_defense}'::public.practice_skill_category[], '{P,1B,3B,C}'::text[], '{all}'::public.practice_age_level[],
     '{baseballs,bases,bat}'::public.practice_equipment[], '{infield}'::public.practice_field_space[],
     4, 6, '• Round the ball to the throw' || E'\n' || '• Clear communication', '{pfp,bunt}'::text[]),

    ('cover-first', 'Cover First Base',
     'Ground ball to right side; pitcher breaks to 1B and takes the flip. Repeat 8-10 times.', 10,
     '{pitching,team_defense}'::public.practice_skill_category[], '{P,1B,2B}'::text[], '{all}'::public.practice_age_level[],
     '{baseballs,bases,bat}'::public.practice_equipment[], '{infield}'::public.practice_field_space[],
     3, 4, '• Break on contact' || E'\n' || '• Catch ball before bag', '{pfp,coverage}'::text[]),

    ('pitchouts', 'Pitchouts',
     'Pitcher throws intentional pitchout; catcher receives and throws to a base.', 8,
     '{pitching,team_defense}'::public.practice_skill_category[], '{P,C,2B,SS}'::text[], '{14u,high_school_jv,high_school_varsity,college,adult}'::public.practice_age_level[],
     '{baseballs,catchers_gear,bases}'::public.practice_equipment[], '{infield}'::public.practice_field_space[],
     4, 6, '• Pitcher gets the ball up and out' || E'\n' || '• C pops out and throws', '{pickoff,runner}'::text[]),

    ('intent-long-toss', 'Intent-Based Long Toss',
     'Long toss with intent at max distance. Builds arm strength. Cooldown with soft flat throws.', 15,
     '{pitching,conditioning}'::public.practice_skill_category[], '{P}'::text[], '{high_school_varsity,college,adult}'::public.practice_age_level[],
     '{baseballs}'::public.practice_equipment[], '{outfield,open_space}'::public.practice_field_space[],
     2, 10, '• Pull-downs to finish' || E'\n' || '• Do not throw through pain', '{arm-care,strength}'::text[]),

    ('velocity-ladder', 'Weighted-Ball Velocity Ladder',
     'Short sequence with weighted balls (under/over) then standard. Supervised; per-arm count.', 15,
     '{pitching,conditioning}'::public.practice_skill_category[], '{P}'::text[], '{high_school_varsity,college,adult}'::public.practice_age_level[],
     '{baseballs,weights}'::public.practice_equipment[], '{bullpen_1,bullpen_2,open_space}'::public.practice_field_space[],
     1, 4, '• Follow program progressions strictly', '{strength,weighted-balls}'::text[]),

    ('change-up-focus', 'Change-Up Focus Bullpen',
     'Bullpen dedicated to change-ups only. Grip, arm speed, release.', 10,
     '{pitching}'::public.practice_skill_category[], '{P,C}'::text[], '{14u,high_school_jv,high_school_varsity,college,adult}'::public.practice_age_level[],
     '{baseballs,catchers_gear}'::public.practice_equipment[], '{bullpen_1,bullpen_2}'::public.practice_field_space[],
     2, 3, '• Fastball arm speed' || E'\n' || '• Pronate through release', '{bullpen,changeup}'::text[]),

    ('curveball-spin', 'Curveball Spin Drill',
     'Short flips focused on 12-to-6 spin axis. Use coach-checked grip; quality reps only.', 10,
     '{pitching}'::public.practice_skill_category[], '{P}'::text[], '{high_school_jv,high_school_varsity,college,adult}'::public.practice_age_level[],
     '{baseballs}'::public.practice_equipment[], '{open_space,bullpen_1,bullpen_2}'::public.practice_field_space[],
     1, 6, '• Get on top of the ball' || E'\n' || '• No wrist snap on young arms', '{bullpen,curve}'::text[]),

    ('flat-ground', 'Flat-Ground Pitching',
     'Throw simulated innings on flat ground; conserves wear on the arm while rehearsing sequence.', 15,
     '{pitching}'::public.practice_skill_category[], '{P,C}'::text[], '{all}'::public.practice_age_level[],
     '{baseballs,catchers_gear}'::public.practice_equipment[], '{open_space,bullpen_1,bullpen_2}'::public.practice_field_space[],
     2, 3, '• Full delivery, full intent', '{recovery,sim-game}'::text[]),

    -- ═══ FIELDING (25) ═════════════════════════════════════════════════════
    ('rolled-grounders', 'Rolled Grounders',
     'Coach rolls grounders; fielders work ready position and fielding triangle.', 10,
     '{fielding}'::public.practice_skill_category[], '{1B,2B,SS,3B}'::text[], '{8u,10u,12u,14u}'::public.practice_age_level[],
     '{baseballs}'::public.practice_equipment[], '{infield,gym}'::public.practice_field_space[],
     2, 8, '• Funnel to the belly button' || E'\n' || '• Glove down early', '{fundamentals}'::text[]),

    ('short-hops', 'Short Hops',
     'Two partners 10ft apart bounce short hops; work glove-only picks.', 10,
     '{fielding}'::public.practice_skill_category[], '{}'::text[], '{all}'::public.practice_age_level[],
     '{baseballs}'::public.practice_equipment[], '{open_space,gym,infield}'::public.practice_field_space[],
     2, 12, '• Soft hands' || E'\n' || '• Track the ball into glove', '{hands,fundamentals}'::text[]),

    ('four-corners', 'Four Corners Fielding',
     'Four players form square; ball moves around corners with fielding footwork.', 10,
     '{fielding,team_defense}'::public.practice_skill_category[], '{}'::text[], '{all}'::public.practice_age_level[],
     '{baseballs}'::public.practice_equipment[], '{infield}'::public.practice_field_space[],
     4, 4, '• Quick feet, quick feet', '{footwork,throwing}'::text[]),

    ('backhand-drill', 'Backhand Drill',
     'Coach hits balls to backhand side; fielder drops right foot, secures, and throws to first.', 10,
     '{fielding}'::public.practice_skill_category[], '{SS,3B,2B}'::text[], '{12u,14u,high_school_jv,high_school_varsity,college,adult}'::public.practice_age_level[],
     '{baseballs,bat,bases}'::public.practice_equipment[], '{infield}'::public.practice_field_space[],
     2, 6, '• Stay low and balanced' || E'\n' || '• Right foot plants outside ball', '{backhand}'::text[]),

    ('charge-throw', 'Charge-and-Throw',
     'Slow rollers charged and thrown on the run. Infielder reads spin and closes on ball.', 10,
     '{fielding}'::public.practice_skill_category[], '{3B,SS,2B,P}'::text[], '{all}'::public.practice_age_level[],
     '{baseballs,bat,bases}'::public.practice_equipment[], '{infield}'::public.practice_field_space[],
     2, 6, '• Throw on the run — don''t stop', '{slow-roller}'::text[]),

    ('double-play-footwork', 'Double-Play Footwork',
     'Middle infielders rep pivot footwork without ball first, then add flip/throw.', 10,
     '{fielding,team_defense}'::public.practice_skill_category[], '{2B,SS}'::text[], '{12u,14u,high_school_jv,high_school_varsity,college,adult}'::public.practice_age_level[],
     '{baseballs,bases}'::public.practice_equipment[], '{infield}'::public.practice_field_space[],
     2, 4, '• Same footwork every time' || E'\n' || '• Quick exchange', '{double-play,footwork}'::text[]),

    ('around-horn', 'Around-the-Horn',
     'Ball starts at catcher; goes to 3B, 2B, SS, 1B, back to C. Fast tempo.', 5,
     '{fielding,team_defense}'::public.practice_skill_category[], '{C,1B,2B,SS,3B}'::text[], '{all}'::public.practice_age_level[],
     '{baseballs,bases}'::public.practice_equipment[], '{infield}'::public.practice_field_space[],
     5, 5, '• Quick exchange, accurate throws', '{warmup,throwing}'::text[]),

    ('crow-hop', 'Crow Hop Throwing',
     'Outfielders or infielders practice crow-hop footwork on long throws.', 8,
     '{fielding}'::public.practice_skill_category[], '{LF,CF,RF,SS,3B}'::text[], '{all}'::public.practice_age_level[],
     '{baseballs}'::public.practice_equipment[], '{outfield,open_space}'::public.practice_field_space[],
     2, 10, '• Small hop, big leverage' || E'\n' || '• Throw through the target', '{throwing,arm-strength}'::text[]),

    ('pop-fly-priority', 'Pop-Fly Priority',
     'Fielders practice loud communication and priority rules on shallow pops.', 10,
     '{fielding,team_defense}'::public.practice_skill_category[], '{1B,2B,SS,3B,LF,CF,RF,P,C}'::text[], '{all}'::public.practice_age_level[],
     '{baseballs,bat}'::public.practice_equipment[], '{full_field,infield,outfield}'::public.practice_field_space[],
     6, 12, '• Call it LOUD: "I got it!"' || E'\n' || '• Back off once called', '{communication,priority}'::text[]),

    ('drop-step', 'Drop Step',
     'Outfielders drop-step on fly balls hit over their head. Emphasize first-step direction.', 10,
     '{fielding}'::public.practice_skill_category[], '{LF,CF,RF}'::text[], '{all}'::public.practice_age_level[],
     '{baseballs,bat}'::public.practice_equipment[], '{outfield}'::public.practice_field_space[],
     2, 8, '• First step back, not sideways' || E'\n' || '• Run on angles', '{outfield,first-step}'::text[]),

    ('do-or-die', 'Do-or-Die Grounders',
     'Simulated bases loaded; any grounder must be thrown home on a line. Charge-and-throw to the plate.', 10,
     '{fielding,team_defense}'::public.practice_skill_category[], '{1B,2B,SS,3B,P,C}'::text[], '{12u,14u,high_school_jv,high_school_varsity,college,adult}'::public.practice_age_level[],
     '{baseballs,bat,bases}'::public.practice_equipment[], '{infield}'::public.practice_field_space[],
     5, 8, '• Charge, glove-side foot first' || E'\n' || '• Throw on a line', '{situational,cutoff}'::text[]),

    ('glove-flip', 'Glove Flip to Second',
     'Second baseman practices glove-side flip to SS covering 2B. Short throws only.', 8,
     '{fielding,team_defense}'::public.practice_skill_category[], '{2B,SS}'::text[], '{12u,14u,high_school_jv,high_school_varsity,college,adult}'::public.practice_age_level[],
     '{baseballs,bases}'::public.practice_equipment[], '{infield}'::public.practice_field_space[],
     2, 4, '• Flip firm, don''t loop' || E'\n' || '• Step toward receiver', '{double-play}'::text[]),

    ('bare-hand', 'Bare-Hand Pickup',
     'Slow roller or ball on ground; fielder bare-hands and throws. Coach hits fungo.', 8,
     '{fielding}'::public.practice_skill_category[], '{SS,2B,3B,P,1B}'::text[], '{14u,high_school_jv,high_school_varsity,college,adult}'::public.practice_age_level[],
     '{baseballs,bat}'::public.practice_equipment[], '{infield}'::public.practice_field_space[],
     1, 6, '• Pinch the ball on the ground' || E'\n' || '• Plant and throw', '{slow-roller,barehand}'::text[]),

    ('wall-ball', 'Wall Ball',
     'Infielder throws ball against a wall, reads hop, and fields. Solo reps.', 10,
     '{fielding}'::public.practice_skill_category[], '{}'::text[], '{all}'::public.practice_age_level[],
     '{baseballs}'::public.practice_equipment[], '{gym,open_space}'::public.practice_field_space[],
     1, 6, '• Read the hop early' || E'\n' || '• Stay low', '{hands,footwork}'::text[]),

    ('infield-takes', 'Infield Takes',
     'Pregame-style infield: coach hits rounds to each position; players work throws across the diamond.', 15,
     '{fielding,team_defense}'::public.practice_skill_category[], '{C,1B,2B,SS,3B}'::text[], '{all}'::public.practice_age_level[],
     '{baseballs,bat,bases}'::public.practice_equipment[], '{full_field,infield}'::public.practice_field_space[],
     5, 8, '• Sharp tempo' || E'\n' || '• Catcher finishes with long throw to 2B', '{pregame,routine}'::text[]),

    ('outfield-drop-step', 'OF Drop-Step on Fly',
     'Fungo fly balls over the outfielder''s head; they drop-step and track. Progression: catches then throws.', 10,
     '{fielding}'::public.practice_skill_category[], '{LF,CF,RF}'::text[], '{all}'::public.practice_age_level[],
     '{baseballs,bat}'::public.practice_equipment[], '{outfield}'::public.practice_field_space[],
     3, 8, '• Eyes on the ball, not the feet', '{outfield,tracking}'::text[]),

    ('comebacker-throw', 'Corner IF to First',
     '3B/1B practice hard grounders with throws to first, including the down-the-line play.', 10,
     '{fielding,team_defense}'::public.practice_skill_category[], '{1B,3B}'::text[], '{all}'::public.practice_age_level[],
     '{baseballs,bat,bases}'::public.practice_equipment[], '{infield}'::public.practice_field_space[],
     2, 4, '• Gather feet, square shoulders' || E'\n' || '• Crow-hop on long throws', '{corner-if}'::text[]),

    ('slow-roller', 'Slow-Roller Bare Hand',
     'Coach rolls slow ball; fielder charges and bare-hands, then throws on the run to 1B.', 10,
     '{fielding}'::public.practice_skill_category[], '{SS,2B,3B,P,1B}'::text[], '{12u,14u,high_school_jv,high_school_varsity,college,adult}'::public.practice_age_level[],
     '{baseballs,bases}'::public.practice_equipment[], '{infield}'::public.practice_field_space[],
     2, 6, '• Right-left-throw footwork', '{slow-roller}'::text[]),

    ('tag-play', 'Middle IF Tag Play',
     'SS/2B practice receiving throws from OF and applying swipe tags on simulated runners.', 10,
     '{fielding,team_defense}'::public.practice_skill_category[], '{2B,SS}'::text[], '{all}'::public.practice_age_level[],
     '{baseballs,bases}'::public.practice_equipment[], '{infield}'::public.practice_field_space[],
     3, 6, '• Straddle, glove to low corner of bag' || E'\n' || '• Sweep across, don''t drop', '{tag}'::text[]),

    ('first-baseman-scoop', 'First Baseman Scoop',
     '1B practices picking short-hops from the infielders. Coach rolls intentionally-low throws.', 10,
     '{fielding}'::public.practice_skill_category[], '{1B}'::text[], '{all}'::public.practice_age_level[],
     '{baseballs,bases}'::public.practice_equipment[], '{infield}'::public.practice_field_space[],
     1, 3, '• Stretch late — find the ball first' || E'\n' || '• Scoop with palm up', '{first-base}'::text[]),

    ('catcher-block', 'Catcher Blocking',
     'Catcher blocks balls in dirt: down-front, angle left, angle right. Progression.', 15,
     '{fielding}'::public.practice_skill_category[], '{C}'::text[], '{all}'::public.practice_age_level[],
     '{baseballs,catchers_gear}'::public.practice_equipment[], '{bullpen_1,bullpen_2,infield}'::public.practice_field_space[],
     1, 3, '• Chest out, ball lands in front' || E'\n' || '• Don''t try to catch, BLOCK', '{catcher,blocking}'::text[]),

    ('catcher-framing', 'Catcher Pitch Framing',
     'Catcher receives 20 pitches with quiet hands; coach judges strike presentation.', 10,
     '{fielding,mental}'::public.practice_skill_category[], '{C}'::text[], '{14u,high_school_jv,high_school_varsity,college,adult}'::public.practice_age_level[],
     '{baseballs,catchers_gear}'::public.practice_equipment[], '{bullpen_1,bullpen_2}'::public.practice_field_space[],
     1, 3, '• Relaxed glove, subtle pull' || E'\n' || '• Stick borderline pitches', '{catcher,framing}'::text[]),

    ('catcher-pop-time', 'Catcher Pop-Time to 2B',
     'Catcher pops out of crouch and throws to 2B. Time with stopwatch; target < 2.0s.', 10,
     '{fielding,team_defense}'::public.practice_skill_category[], '{C,2B,SS}'::text[], '{high_school_jv,high_school_varsity,college,adult}'::public.practice_age_level[],
     '{baseballs,catchers_gear,bases}'::public.practice_equipment[], '{infield}'::public.practice_field_space[],
     3, 4, '• Fast transfer' || E'\n' || '• Accurate beats faster', '{catcher,pop-time}'::text[]),

    ('of-crow-hop-throw', 'OF Crow-Hop Throws',
     'Outfielders rep crow-hop footwork on throws to cutoff. Target accuracy first.', 10,
     '{fielding}'::public.practice_skill_category[], '{LF,CF,RF}'::text[], '{all}'::public.practice_age_level[],
     '{baseballs,bat}'::public.practice_equipment[], '{outfield}'::public.practice_field_space[],
     3, 8, '• One-hop to cutoff' || E'\n' || '• Hit the chest', '{outfield,throwing}'::text[]),

    ('of-communication', 'OF Gap Communication',
     'Two outfielders cover a gap; coach hits between them to force calls.', 10,
     '{fielding,team_defense}'::public.practice_skill_category[], '{LF,CF,RF}'::text[], '{all}'::public.practice_age_level[],
     '{baseballs,bat}'::public.practice_equipment[], '{outfield}'::public.practice_field_space[],
     2, 4, '• Call LOUD, echo LOUDER' || E'\n' || '• CF has priority', '{communication,outfield}'::text[]),

    -- ═══ BASERUNNING (15) ═════════════════════════════════════════════════
    ('home-first-turn', 'Home-to-First Turn',
     'Runner takes full speed out of box, rounds 1B looking to advance. Reps: 5.', 8,
     '{baserunning}'::public.practice_skill_category[], '{}'::text[], '{all}'::public.practice_age_level[],
     '{bases,helmet}'::public.practice_equipment[], '{infield}'::public.practice_field_space[],
     1, 6, '• Flare out at 20ft — hit the bag corner' || E'\n' || '• Head up, look for ball', '{running,turns}'::text[]),

    ('secondary-lead', 'Secondary Lead',
     'Runner takes primary lead; shuffles on pitch. Coach calls contact or no-contact; runner reads.', 10,
     '{baserunning}'::public.practice_skill_category[], '{}'::text[], '{12u,14u,high_school_jv,high_school_varsity,college,adult}'::public.practice_age_level[],
     '{bases,helmet}'::public.practice_equipment[], '{infield}'::public.practice_field_space[],
     2, 8, '• Shuffle on release' || E'\n' || '• Freeze on line drive', '{leads,reads}'::text[]),

    ('primary-lead', 'Primary Lead',
     'Work 1-way leads: measure body lengths, pivot on pickoff, dive back.', 10,
     '{baserunning}'::public.practice_skill_category[], '{}'::text[], '{all}'::public.practice_age_level[],
     '{bases,helmet}'::public.practice_equipment[], '{infield}'::public.practice_field_space[],
     2, 8, '• Low center of gravity' || E'\n' || '• One-way lead: right foot pivots', '{leads}'::text[]),

    ('read-pitcher', 'Read-Pitcher Pickoff',
     'Runner reads pitcher''s move; coach times reaction. Practice leaning toward vs. diving back.', 10,
     '{baserunning,mental}'::public.practice_skill_category[], '{}'::text[], '{14u,high_school_jv,high_school_varsity,college,adult}'::public.practice_age_level[],
     '{bases,helmet}'::public.practice_equipment[], '{infield}'::public.practice_field_space[],
     2, 6, '• Read the heel, not the head' || E'\n' || '• First step decisive', '{steal,pickoff-read}'::text[]),

    ('sliding-basic', 'Basic Slide',
     'Teach the figure-4 bent-leg slide on grass or wet tarp. Safety first.', 12,
     '{baserunning}'::public.practice_skill_category[], '{}'::text[], '{all}'::public.practice_age_level[],
     '{bases,helmet}'::public.practice_equipment[], '{outfield,open_space}'::public.practice_field_space[],
     2, 10, '• Bottom leg bent, top leg straight' || E'\n' || '• Hands up, don''t jam', '{sliding,safety}'::text[]),

    ('head-first', 'Head-First Slide',
     'Teach head-first slide into bag; only where allowed by league. Safe hand reach.', 10,
     '{baserunning}'::public.practice_skill_category[], '{}'::text[], '{high_school_jv,high_school_varsity,college,adult}'::public.practice_age_level[],
     '{bases,helmet}'::public.practice_equipment[], '{outfield,open_space}'::public.practice_field_space[],
     2, 8, '• Chin up, hands relaxed' || E'\n' || '• Glide on chest, don''t belly-flop', '{sliding,head-first}'::text[]),

    ('pop-slide', 'Pop-Up Slide',
     'Runner slides into 2B or 3B and pops up ready to advance on overthrow.', 10,
     '{baserunning}'::public.practice_skill_category[], '{}'::text[], '{12u,14u,high_school_jv,high_school_varsity,college,adult}'::public.practice_age_level[],
     '{bases,helmet}'::public.practice_equipment[], '{infield,open_space}'::public.practice_field_space[],
     2, 8, '• Plant top foot, use momentum up' || E'\n' || '• Scan for overthrow', '{sliding,advance}'::text[]),

    ('delayed-steal', 'Delayed Steal',
     'Runner on 1B; delays first step on pitch then takes off after catcher''s throw-back lapse.', 10,
     '{baserunning,mental}'::public.practice_skill_category[], '{}'::text[], '{high_school_jv,high_school_varsity,college,adult}'::public.practice_age_level[],
     '{bases,helmet}'::public.practice_equipment[], '{infield}'::public.practice_field_space[],
     2, 6, '• Read catcher return toss' || E'\n' || '• Full speed through 2B', '{steal,situational}'::text[]),

    ('tag-up', 'Tag-Up on Fly',
     'Runner at 3B (or 2B) tags on fly ball; practices timing release with the catch.', 10,
     '{baserunning}'::public.practice_skill_category[], '{}'::text[], '{12u,14u,high_school_jv,high_school_varsity,college,adult}'::public.practice_age_level[],
     '{bases,helmet,baseballs,bat}'::public.practice_equipment[], '{full_field,outfield}'::public.practice_field_space[],
     3, 8, '• Listen for coach call' || E'\n' || '• First step at catch', '{tag-up,situational}'::text[]),

    ('first-to-third', 'First-to-Third Reads',
     'Runner on 1B; coach hits fungo to outfield. Runner reads angle and decides on third.', 10,
     '{baserunning,mental}'::public.practice_skill_category[], '{}'::text[], '{12u,14u,high_school_jv,high_school_varsity,college,adult}'::public.practice_age_level[],
     '{bases,helmet,baseballs,bat}'::public.practice_equipment[], '{full_field}'::public.practice_field_space[],
     2, 8, '• Peek over shoulder between 1B and 2B' || E'\n' || '• Coach call at 2B is KING', '{reads,base-advance}'::text[]),

    ('steal-jump', 'Steal First-Step',
     'Runner works initial jump: crossover vs. pivot start. Coach grades via stopwatch.', 10,
     '{baserunning,conditioning}'::public.practice_skill_category[], '{}'::text[], '{high_school_jv,high_school_varsity,college,adult}'::public.practice_age_level[],
     '{bases,helmet}'::public.practice_equipment[], '{infield,open_space}'::public.practice_field_space[],
     2, 8, '• Commit instantly on read' || E'\n' || '• Drive the back leg', '{steal,speed}'::text[]),

    ('rundown-drill', 'Rundown Drill',
     'Runner caught between bases; two fielders work short quick throws to catch runner.', 10,
     '{baserunning,team_defense,fielding}'::public.practice_skill_category[], '{}'::text[], '{all}'::public.practice_age_level[],
     '{bases,baseballs}'::public.practice_equipment[], '{infield}'::public.practice_field_space[],
     4, 8, '• One throw ideally — never more than two' || E'\n' || '• Run full speed at runner', '{rundown}'::text[]),

    ('lead-off-return', 'Lead-Off / Return Safely',
     'Runner takes lead, practices safe return on pickoff. Focus on lead distance and foot position.', 8,
     '{baserunning}'::public.practice_skill_category[], '{}'::text[], '{all}'::public.practice_age_level[],
     '{bases,helmet}'::public.practice_equipment[], '{infield}'::public.practice_field_space[],
     2, 10, '• Lead with right foot, not left' || E'\n' || '• Dive BACK, not across', '{leads,safety}'::text[]),

    ('two-out-second', 'Two-Out Baserunning from 2B',
     'Runner on 2B with 2 outs; runs on contact. Practice full-speed reads.', 10,
     '{baserunning,mental}'::public.practice_skill_category[], '{}'::text[], '{12u,14u,high_school_jv,high_school_varsity,college,adult}'::public.practice_age_level[],
     '{bases,helmet,baseballs,bat}'::public.practice_equipment[], '{full_field}'::public.practice_field_space[],
     2, 8, '• GO on contact' || E'\n' || '• Ignore outfielder — trust the coach', '{situational}'::text[]),

    ('home-plate-slide', 'Home-Plate Slide',
     'Runner approaches home; slides to avoid tag. Respect new plate-collision rules.', 10,
     '{baserunning}'::public.practice_skill_category[], '{}'::text[], '{12u,14u,high_school_jv,high_school_varsity,college,adult}'::public.practice_age_level[],
     '{bases,helmet}'::public.practice_equipment[], '{infield,open_space}'::public.practice_field_space[],
     2, 6, '• Legal slide — NO collisions' || E'\n' || '• Touch plate on evasion', '{sliding,safety}'::text[]),

    -- ═══ TEAM DEFENSE (15) ════════════════════════════════════════════════
    ('first-and-third', 'First-and-Third Defense',
     'Runners on 1st and 3rd; defense works three plays: throw to 2B, cut off, or step & throw home.', 15,
     '{team_defense,fielding}'::public.practice_skill_category[], '{P,C,1B,2B,SS,3B}'::text[], '{14u,high_school_jv,high_school_varsity,college,adult}'::public.practice_age_level[],
     '{baseballs,bases,catchers_gear}'::public.practice_equipment[], '{full_field}'::public.practice_field_space[],
     7, 11, '• Catcher reads R3 on release' || E'\n' || '• Pre-pitch communication', '{situational,first-and-third}'::text[]),

    ('bunt-coverage', 'Bunt Coverage (All)',
     'Defense covers bunt in every situation (runner 1B, 1B/2B, 2B, bases loaded).', 15,
     '{team_defense,fielding}'::public.practice_skill_category[], '{P,C,1B,3B,2B,SS}'::text[], '{all}'::public.practice_age_level[],
     '{baseballs,bases,bat}'::public.practice_equipment[], '{full_field}'::public.practice_field_space[],
     6, 10, '• Call the play loudly' || E'\n' || '• Coach cycles through scenarios', '{bunt,coverage}'::text[]),

    ('cut-relay-shallow', 'Cut/Relay: Shallow OF',
     'Balls in the gap or down the line. Cutoff positioning with single relay throw.', 12,
     '{team_defense,fielding}'::public.practice_skill_category[], '{LF,CF,RF,1B,2B,SS,3B,C}'::text[], '{all}'::public.practice_age_level[],
     '{baseballs,bat,bases}'::public.practice_equipment[], '{full_field}'::public.practice_field_space[],
     7, 10, '• Cutoff mirrors runner''s location' || E'\n' || '• One-hop to the cut', '{cutoff,relay}'::text[]),

    ('cut-relay-deep', 'Cut/Relay: Deep OF',
     'Ball to deep OF; double cut with relay man lining up cutoff. Practice all bases.', 15,
     '{team_defense,fielding}'::public.practice_skill_category[], '{LF,CF,RF,1B,2B,SS,3B,C}'::text[], '{14u,high_school_jv,high_school_varsity,college,adult}'::public.practice_age_level[],
     '{baseballs,bat,bases}'::public.practice_equipment[], '{full_field}'::public.practice_field_space[],
     8, 10, '• Relay must be in line with throw' || E'\n' || '• Communicate loudly', '{relay,deep-of}'::text[]),

    ('rundown-multi', 'Multi-Runner Rundown',
     'Runner on 2B breaks; trail runner on 1B creates chaos. Defense handles multiple runners.', 10,
     '{team_defense,fielding,baserunning}'::public.practice_skill_category[], '{}'::text[], '{high_school_jv,high_school_varsity,college,adult}'::public.practice_age_level[],
     '{baseballs,bases}'::public.practice_equipment[], '{infield}'::public.practice_field_space[],
     6, 10, '• Get lead runner first' || E'\n' || '• Back-bases covered', '{rundown,advanced}'::text[]),

    ('pop-fly-in-sun', 'Pop Fly with Sun',
     'Outfielders practice pop flies into the sun using glove as a shade. Safe drill.', 8,
     '{team_defense,fielding}'::public.practice_skill_category[], '{LF,CF,RF,1B,2B,SS,3B}'::text[], '{all}'::public.practice_age_level[],
     '{baseballs,bat}'::public.practice_equipment[], '{outfield}'::public.practice_field_space[],
     3, 9, '• Glove up to block the sun' || E'\n' || '• CALL OFF if lost', '{outfield,sun,safety}'::text[]),

    ('pickoff-set-piece', 'Set-Piece Pickoff 2B',
     'Middle infielders run timed pickoff at 2B on signal. Both inside-move and daylight plays.', 10,
     '{team_defense,pitching}'::public.practice_skill_category[], '{P,2B,SS}'::text[], '{14u,high_school_jv,high_school_varsity,college,adult}'::public.practice_age_level[],
     '{baseballs,bases}'::public.practice_equipment[], '{infield}'::public.practice_field_space[],
     3, 5, '• Timing is everything' || E'\n' || '• Signal then silent count', '{pickoff,set-piece}'::text[]),

    ('double-play-6-4-3', '6-4-3 Double Play',
     'Ball to SS, turn at 2B by 2B, finish at 1B. Rep 8-10 times at game speed.', 10,
     '{team_defense,fielding}'::public.practice_skill_category[], '{SS,2B,1B}'::text[], '{12u,14u,high_school_jv,high_school_varsity,college,adult}'::public.practice_age_level[],
     '{baseballs,bat,bases}'::public.practice_equipment[], '{infield}'::public.practice_field_space[],
     3, 5, '• Same footwork every time' || E'\n' || '• Accuracy on feed', '{double-play}'::text[]),

    ('double-play-4-6-3', '4-6-3 Double Play',
     'Ball to 2B, flip/toss to SS covering, throw to 1B.', 10,
     '{team_defense,fielding}'::public.practice_skill_category[], '{2B,SS,1B}'::text[], '{12u,14u,high_school_jv,high_school_varsity,college,adult}'::public.practice_age_level[],
     '{baseballs,bat,bases}'::public.practice_equipment[], '{infield}'::public.practice_field_space[],
     3, 5, '• 2B clears path for SS' || E'\n' || '• SS crosses bag', '{double-play}'::text[]),

    ('infield-fly', 'Infield-Fly Execution',
     'Teach infield-fly rule via sim situations. Umpire call simulated; runners practice tagging.', 8,
     '{team_defense,mental}'::public.practice_skill_category[], '{1B,2B,SS,3B,P,C}'::text[], '{high_school_jv,high_school_varsity,college,adult}'::public.practice_age_level[],
     '{baseballs,bat,bases}'::public.practice_equipment[], '{infield}'::public.practice_field_space[],
     5, 10, '• Rule applies: force, < 2 outs, popup' || E'\n' || '• Runners tag at own risk', '{rules,situational}'::text[]),

    ('pfp-full-team', 'Full-Team PFP',
     'All 9 run through PFPs at game speed: bunt coverage, comebacker, cover 1B.', 15,
     '{team_defense,pitching,fielding}'::public.practice_skill_category[], '{P,C,1B,2B,SS,3B,LF,CF,RF}'::text[], '{all}'::public.practice_age_level[],
     '{baseballs,bat,bases,catchers_gear}'::public.practice_equipment[], '{full_field}'::public.practice_field_space[],
     9, 12, '• Crisp, loud, every rep' || E'\n' || '• Rotate pitchers every 2 reps', '{pfp,team}'::text[]),

    ('coverage-on-bunt', '1B/3B Bunt Coverage',
     'Corners crash on bunt; 2B covers 1B; SS covers 2B; LF backs up 3B. Walk through at speed.', 10,
     '{team_defense,fielding}'::public.practice_skill_category[], '{1B,3B,2B,SS,LF}'::text[], '{14u,high_school_jv,high_school_varsity,college,adult}'::public.practice_age_level[],
     '{baseballs,bases,bat}'::public.practice_equipment[], '{full_field}'::public.practice_field_space[],
     6, 8, '• Pre-pitch set' || E'\n' || '• Call the play together', '{bunt,coverage}'::text[]),

    ('wild-pitch', 'Wild Pitch/Passed Ball',
     'Ball gets past catcher; P covers home; C retrieves and flips. Timed.', 8,
     '{team_defense,fielding,pitching}'::public.practice_skill_category[], '{P,C}'::text[], '{all}'::public.practice_age_level[],
     '{baseballs,catchers_gear,bases}'::public.practice_equipment[], '{infield}'::public.practice_field_space[],
     2, 2, '• P breaks immediately' || E'\n' || '• C reports feet toward home', '{passed-ball,coverage}'::text[]),

    ('pitchout-and-throw', 'Pitchout + Catcher Throw',
     'Pitcher throws pitchout; catcher throws to 2B or 3B. Practice coordination.', 8,
     '{team_defense,pitching}'::public.practice_skill_category[], '{P,C,2B,SS,3B}'::text[], '{high_school_jv,high_school_varsity,college,adult}'::public.practice_age_level[],
     '{baseballs,catchers_gear,bases}'::public.practice_equipment[], '{infield}'::public.practice_field_space[],
     4, 6, '• Sign coordination matters' || E'\n' || '• Pitch up and out', '{pitchout}'::text[]),

    ('situational-scrimmage', 'Situational Scrimmage',
     'Short inter-squad scrimmage with coach calling situations: R1, R2, bunt, 3-2 count, etc.', 25,
     '{team_defense,hitting,baserunning,fielding,mental}'::public.practice_skill_category[], '{}'::text[], '{all}'::public.practice_age_level[],
     '{baseballs,bat,bases,catchers_gear,helmet}'::public.practice_equipment[], '{full_field}'::public.practice_field_space[],
     12, 20, '• Stop the clock — coach it up' || E'\n' || '• Players verbalize their job', '{scrimmage,gameplay}'::text[]),

    -- ═══ CONDITIONING (10) ═════════════════════════════════════════════════
    ('warmup-jog', 'Dynamic Warmup Jog',
     'Light jog with dynamic leg swings, high knees, butt kicks, skips.', 8,
     '{conditioning}'::public.practice_skill_category[], '{}'::text[], '{all}'::public.practice_age_level[],
     '{}'::public.practice_equipment[], '{outfield,open_space,gym}'::public.practice_field_space[],
     1, 25, '• Controlled tempo' || E'\n' || '• Full range of motion', '{warmup,conditioning}'::text[]),

    ('agility-ladder', 'Agility Ladder',
     'Cycle through 6 ladder patterns: 2-foot, lateral, icky shuffle, etc.', 10,
     '{conditioning,agility}'::public.practice_skill_category[], '{}'::text[], '{all}'::public.practice_age_level[],
     '{agility_ladder}'::public.practice_equipment[], '{open_space,gym}'::public.practice_field_space[],
     2, 10, '• Quick feet, controlled head' || E'\n' || '• Don''t step on rungs', '{agility,footwork}'::text[]),

    ('cone-shuffle', 'Cone Shuffle',
     'Three cones in a triangle; player shuffles between them on coach signal.', 8,
     '{conditioning,agility}'::public.practice_skill_category[], '{}'::text[], '{all}'::public.practice_age_level[],
     '{cones}'::public.practice_equipment[], '{open_space,gym}'::public.practice_field_space[],
     1, 10, '• Low, athletic stance' || E'\n' || '• Sharp direction change', '{agility,lateral}'::text[]),

    ('pfo-sprints', 'Short Sprints',
     '10/20/30-yard sprints with 30-second rest. 8 rounds total.', 10,
     '{conditioning}'::public.practice_skill_category[], '{}'::text[], '{14u,high_school_jv,high_school_varsity,college,adult}'::public.practice_age_level[],
     '{cones}'::public.practice_equipment[], '{outfield,open_space}'::public.practice_field_space[],
     4, 20, '• Full effort', '{speed,anaerobic}'::text[]),

    ('bases-sprint', 'Bases Sprint Circuit',
     'Run all 4 bases at full speed; walk back. 4-6 repetitions.', 10,
     '{conditioning,baserunning}'::public.practice_skill_category[], '{}'::text[], '{all}'::public.practice_age_level[],
     '{bases}'::public.practice_equipment[], '{full_field}'::public.practice_field_space[],
     2, 20, '• Proper turns at each bag' || E'\n' || '• Competitive timing', '{sprint,running}'::text[]),

    ('plyo-hops', 'Plyometric Hops',
     'Box jumps, broad jumps, lateral hops. 3 sets of 8, full rest between.', 10,
     '{conditioning}'::public.practice_skill_category[], '{}'::text[], '{high_school_jv,high_school_varsity,college,adult}'::public.practice_age_level[],
     '{}'::public.practice_equipment[], '{open_space,gym}'::public.practice_field_space[],
     1, 12, '• Land softly, absorb' || E'\n' || '• Quality over quantity', '{plyo,power}'::text[]),

    ('core-circuit', 'Core Circuit',
     'Plank 30s, side plank 20s/side, dead bugs 10, Russian twists 15. 3 rounds.', 12,
     '{conditioning}'::public.practice_skill_category[], '{}'::text[], '{all}'::public.practice_age_level[],
     '{medicine_ball}'::public.practice_equipment[], '{open_space,gym,classroom}'::public.practice_field_space[],
     1, 20, '• Brace the core, breathe through work' || E'\n' || '• Slow and controlled', '{core,strength}'::text[]),

    ('resistance-band', 'Resistance-Band Shoulder',
     'Full shoulder prehab circuit: rows, pulls, external/internal rotations, Ys/Ts/Ws.', 10,
     '{conditioning,pitching}'::public.practice_skill_category[], '{}'::text[], '{all}'::public.practice_age_level[],
     '{}'::public.practice_equipment[], '{open_space,gym,classroom}'::public.practice_field_space[],
     1, 20, '• Slow, controlled reps' || E'\n' || '• Do not sacrifice form for reps', '{prehab,shoulder}'::text[]),

    ('foam-roll', 'Foam Roll Recovery',
     'Quads, IT band, glutes, lats, thoracic. Brief pre- or post-practice.', 8,
     '{conditioning,mental}'::public.practice_skill_category[], '{}'::text[], '{high_school_jv,high_school_varsity,college,adult}'::public.practice_age_level[],
     '{}'::public.practice_equipment[], '{open_space,gym,classroom}'::public.practice_field_space[],
     1, 25, '• Slow passes over each muscle', '{recovery}'::text[]),

    ('cooldown-stretch', 'Cooldown Stretch',
     'Team stretch circle: hamstrings, quads, hip flexors, shoulders, upper back, forearms.', 8,
     '{conditioning,mental}'::public.practice_skill_category[], '{}'::text[], '{all}'::public.practice_age_level[],
     '{}'::public.practice_equipment[], '{outfield,open_space,gym}'::public.practice_field_space[],
     1, 25, '• Hold each stretch 20-30 seconds' || E'\n' || '• Team-building close-out', '{cooldown,flexibility}'::text[])
  ) as d(
    slug, name, description, duration, skills, positions, ages, equipment, spaces,
    min_p, max_p, coaching_points, tags
  )
  on conflict (id) do nothing;
end $$;
