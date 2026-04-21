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

  it('filters drills using AND across filter keys and OR within value arrays', () => {
    const out = filterDrills(library, {
      skillCategories: [PracticeSkillCategory.HITTING, PracticeSkillCategory.PITCHING],
      fieldSpaces: [PracticeFieldSpace.CAGE_1],
    });
    expect(out.map((d) => d.id)).toEqual(['a']);
  });

  it('search is case-insensitive across name and tags', () => {
    // Fixture only exercises name + tags; description/source coverage is added
    // separately below.
    expect(filterDrills(library, { search: 'TEE' }).map((d) => d.id)).toEqual(['a']);
    expect(filterDrills(library, { search: 'fundamentals' }).map((d) => d.id)).toEqual(['a']);
  });

  it('search matches description and source fields too', () => {
    const withText: PracticeDrill[] = [
      drill({ id: 'd1', name: 'Anon', description: 'Quick footwork routine' }),
      drill({ id: 'd2', name: 'Anon2', source: 'Coach smith manual' }),
    ];
    expect(
      filterDrills(withText, { search: 'footwork' }).map((d) => d.id),
    ).toEqual(['d1']);
    expect(
      filterDrills(withText, { search: 'smith' }).map((d) => d.id),
    ).toEqual(['d2']);
  });

  it('durationMax excludes longer drills but keeps flexible (no duration) ones', () => {
    const flexible = drill({ id: 'x', name: 'Flexible' });
    const out = filterDrills([...library, flexible], { durationMax: 10 });
    // a=10 and c=8 pass; b=20 excluded; flexible (no duration) always passes.
    expect(out.map((d) => d.id).sort()).toEqual(['a', 'c', 'x']);
  });

  it('ageLevels: drills marked all_age match any requested filter but non-matching are excluded', () => {
    const varsityOnly = drill({
      id: 'v',
      name: 'Varsity only',
      ageLevels: [PracticeAgeLevel.HIGH_SCHOOL_VARSITY],
    });
    const out = filterDrills([...library, varsityOnly], {
      ageLevels: [PracticeAgeLevel.U10],
    });
    const ids = out.map((d) => d.id);
    // 'a' and 'b' are all-ages, so they match U10; 'c' advertises only varsity
    // and 'v' advertises only varsity so both must be excluded.
    expect(ids).toContain('a');
    expect(ids).not.toContain('c');
    expect(ids).not.toContain('v');
  });

  it('positions empty array on drill means any position, but non-matching positions are excluded', () => {
    const pitcherOnly = drill({
      id: 'p',
      name: 'Pitcher only',
      positions: ['P'],
    });
    const out = filterDrills([...library, pitcherOnly], { positions: ['SS'] });
    const ids = out.map((d) => d.id);
    // library entries have empty positions → match; pitcherOnly has ['P'] → excluded.
    expect(ids.sort()).toEqual(['a', 'b', 'c']);
    expect(ids).not.toContain('p');
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
