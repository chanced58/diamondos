import {
  PracticeAgeLevel,
  PracticeDrill,
  PracticeDrillVisibility,
  PracticeEquipment,
  PracticeFieldSpace,
  PracticeSkillCategory,
} from '../../types/practice-drill';
import { filterDrills, sortDrills } from '../practice-drill-filter';

function drill(overrides: Partial<PracticeDrill> & { id: string; name: string }): PracticeDrill {
  return {
    teamId: null,
    visibility: PracticeDrillVisibility.SYSTEM,
    description: '',
    skillCategories: [],
    positions: [],
    ageLevels: [PracticeAgeLevel.ALL],
    equipment: [],
    fieldSpaces: [],
    tags: [],
    createdAt: '2026-04-01T00:00:00Z',
    updatedAt: '2026-04-01T00:00:00Z',
    ...overrides,
  };
}

describe('filterDrills', () => {
  const library: PracticeDrill[] = [
    drill({
      id: 'a',
      name: 'Tee Work',
      skillCategories: [PracticeSkillCategory.HITTING],
      equipment: [PracticeEquipment.TEES, PracticeEquipment.BASEBALLS],
      fieldSpaces: [PracticeFieldSpace.CAGE_1],
      tags: ['fundamentals'],
      defaultDurationMinutes: 10,
      minPlayers: 1,
      maxPlayers: 4,
    }),
    drill({
      id: 'b',
      name: 'Bullpen',
      skillCategories: [PracticeSkillCategory.PITCHING],
      equipment: [PracticeEquipment.BASEBALLS, PracticeEquipment.CATCHERS_GEAR],
      fieldSpaces: [PracticeFieldSpace.BULLPEN_1],
      defaultDurationMinutes: 20,
      minPlayers: 2,
      maxPlayers: 3,
    }),
    drill({
      id: 'c',
      name: 'Conditioning Sprints',
      skillCategories: [PracticeSkillCategory.CONDITIONING],
      fieldSpaces: [PracticeFieldSpace.OUTFIELD, PracticeFieldSpace.OPEN_SPACE],
      ageLevels: [PracticeAgeLevel.HIGH_SCHOOL_VARSITY],
      defaultDurationMinutes: 8,
    }),
  ];

  it('AND across keys, OR within', () => {
    const out = filterDrills(library, {
      skillCategories: [PracticeSkillCategory.HITTING, PracticeSkillCategory.PITCHING],
      fieldSpaces: [PracticeFieldSpace.CAGE_1],
    });
    expect(out.map((d) => d.id)).toEqual(['a']);
  });

  it('search is case-insensitive across name, tags, description', () => {
    expect(filterDrills(library, { search: 'TEE' }).map((d) => d.id)).toEqual(['a']);
    expect(filterDrills(library, { search: 'fundamentals' }).map((d) => d.id)).toEqual(['a']);
  });

  it('durationMax excludes longer drills but keeps flexible (no duration) ones', () => {
    const flexible = drill({ id: 'x', name: 'Flexible' });
    const out = filterDrills([...library, flexible], { durationMax: 10 });
    // a=10 and c=8 pass; b=20 excluded; flexible (no duration) always passes.
    expect(out.map((d) => d.id).sort()).toEqual(['a', 'c', 'x']);
  });

  it('ageLevels: drills marked all_age match any requested filter', () => {
    expect(
      filterDrills(library, { ageLevels: [PracticeAgeLevel.U10] }).map((d) => d.id),
    ).toContain('a');
  });

  it('positions empty array on drill means any position', () => {
    const out = filterDrills(library, { positions: ['SS'] });
    expect(out.map((d) => d.id).sort()).toEqual(['a', 'b', 'c']);
  });

  it('visibility=team excludes system drills', () => {
    const teamDrill = drill({
      id: 't1',
      name: 'Team Custom',
      teamId: 'team-1',
      visibility: PracticeDrillVisibility.TEAM,
    });
    const out = filterDrills([...library, teamDrill], { visibility: 'team' });
    expect(out.map((d) => d.id)).toEqual(['t1']);
  });
});

describe('sortDrills', () => {
  const library: PracticeDrill[] = [
    drill({ id: 'a', name: 'Zebra', defaultDurationMinutes: 30, updatedAt: '2026-04-02T00:00:00Z' }),
    drill({ id: 'b', name: 'Alpha', defaultDurationMinutes: 10, updatedAt: '2026-04-05T00:00:00Z' }),
    drill({ id: 'c', name: 'Mango', defaultDurationMinutes: 20, updatedAt: '2026-04-03T00:00:00Z' }),
  ];

  it('sorts alphabetically by name', () => {
    expect(sortDrills(library, 'name').map((d) => d.id)).toEqual(['b', 'c', 'a']);
  });

  it('sorts by duration ascending', () => {
    expect(sortDrills(library, 'duration').map((d) => d.id)).toEqual(['b', 'c', 'a']);
  });

  it('sorts by most-recent updatedAt', () => {
    expect(sortDrills(library, 'recent').map((d) => d.id)).toEqual(['b', 'c', 'a']);
  });
});
