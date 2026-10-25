import { PracticeSkillCategory, type PracticeDrill } from '@baseball/shared';
import { browseDrills, drillPlayers, drillSubtitle } from '../drill-format';
import { drillFields, drillFormValuesFrom, emptyDrillFormValues, moved, toggled, validateDrillForm } from '../drill-form-model';
import { planPracticeFields, validatePlanForm } from '../practice-form-model';

const TEAM = '11111111-1111-4111-8111-111111111111';
const DRILL = '22222222-2222-4222-8222-222222222222';

const drill = (overrides: Partial<PracticeDrill>): PracticeDrill => ({
  id: 'd',
  teamId: null,
  visibility: 'system' as PracticeDrill['visibility'],
  name: 'Drill',
  skillCategories: [PracticeSkillCategory.HITTING],
  positions: [],
  ageLevels: [],
  equipment: [],
  fieldSpaces: [],
  tags: [],
  createdAt: '',
  updatedAt: '',
  ...overrides,
});

describe('browseDrills', () => {
  const drills = [
    drill({ id: 'b', name: 'Tee work' }),
    drill({ id: 'a', name: 'Soft toss', visibility: 'team' as PracticeDrill['visibility'], teamId: TEAM }),
    drill({ id: 'c', name: 'Long toss', skillCategories: [PracticeSkillCategory.PITCHING], coachingPoints: 'Arc the ball' }),
  ];

  it('should filter by source, category and search, and sort by name', () => {
    expect(browseDrills(drills, { search: '', source: 'all', skillCategories: [] }).map((d) => d.id)).toEqual(['c', 'a', 'b']);
    expect(browseDrills(drills, { search: '', source: 'team', skillCategories: [] }).map((d) => d.id)).toEqual(['a']);
    expect(browseDrills(drills, { search: '', source: 'system', skillCategories: [PracticeSkillCategory.HITTING] }).map((d) => d.id)).toEqual(['b']);
    // Search reaches the coaching points too, as on the web.
    expect(browseDrills(drills, { search: 'arc', source: 'all', skillCategories: [] }).map((d) => d.id)).toEqual(['c']);
  });

  it('should describe a drill by its categories, length and players', () => {
    expect(drillSubtitle(drill({ skillCategories: [PracticeSkillCategory.HITTING, PracticeSkillCategory.FIELDING], defaultDurationMinutes: 15 }))).toBe(
      'Hitting, Fielding · 15 min',
    );
    expect(drillPlayers({ minPlayers: 4, maxPlayers: 12 })).toBe('4–12 players');
    expect(drillPlayers({ minPlayers: 4 })).toBe('4+ players');
    expect(drillPlayers({ maxPlayers: 6 })).toBe('Up to 6 players');
    expect(drillPlayers({})).toBeNull();
  });
});

describe('drill form', () => {
  it('should require a name and a skill category, and whole numbers', () => {
    expect(validateDrillForm(emptyDrillFormValues())).toBe('Name is required.');
    expect(validateDrillForm({ ...emptyDrillFormValues(), name: 'Tee' })).toBe('Pick at least one skill category');
    expect(validateDrillForm({ ...emptyDrillFormValues(), name: 'Tee', skillCategories: [PracticeSkillCategory.HITTING], duration: '7.5' })).toBe(
      'Duration must be a whole number.',
    );
    expect(
      validateDrillForm({ ...emptyDrillFormValues(), name: 'Tee', skillCategories: [PracticeSkillCategory.HITTING], minPlayers: '6', maxPlayers: '2' }),
    ).toBe('Max players must be at least min players.');
  });

  it("should carry an edited drill's hidden fields and clear blank ones", () => {
    const saved = drill({
      name: 'Tee',
      description: 'Old',
      positions: ['C'],
      ageLevels: ['14u'] as PracticeDrill['ageLevels'],
      videoUrl: 'https://example.com/v',
      tags: ['timing', 'contact'],
    });
    const values = { ...drillFormValuesFrom(saved), description: '  ', tags: 'timing,  , contact ' };
    expect(values.tags).toBe('timing,  , contact ');
    expect(drillFormValuesFrom(saved).tags).toBe('timing, contact');
    expect(drillFields(values, saved)).toMatchObject({
      name: 'Tee',
      description: undefined,
      tags: ['timing', 'contact'],
      positions: ['C'],
      ageLevels: ['14u'],
      videoUrl: 'https://example.com/v',
    });
  });

  it('should toggle and move items in a list', () => {
    expect(toggled(['a', 'b'], 'a')).toEqual(['b']);
    expect(toggled(['a'], 'b')).toEqual(['a', 'b']);
    expect(moved(['a', 'b', 'c'], 2, -1)).toEqual(['a', 'c', 'b']);
    expect(moved(['a', 'b'], 0, -1)).toEqual(['a', 'b']);
  });
});

describe('plan from drills', () => {
  const values = { date: '2026-10-27', time: '16:00', duration: '90', venue: null, notifyTeam: false };

  it('should send the practice, the trimmed plan and the drills in order', () => {
    const fields = planPracticeFields(values, '  Timing day  ', [DRILL]);
    expect(fields).toMatchObject({ durationMinutes: 90, location: null, plan: 'Timing day', drillIds: [DRILL] });
    expect(fields).not.toHaveProperty('notifyTeam');
    expect(planPracticeFields(values, '   ', []).plan).toBeNull();
    expect(validatePlanForm(TEAM, values, '', [DRILL])).toBeNull();
  });

  it('should refuse a bad duration and an overlong plan', () => {
    expect(validatePlanForm(TEAM, { ...values, duration: 'x' }, '', [])).toBe('Duration must be a whole number of minutes.');
    expect(validatePlanForm(TEAM, values, 'a'.repeat(20001), [])).toBe('The plan must be 20,000 characters or fewer.');
  });
});
