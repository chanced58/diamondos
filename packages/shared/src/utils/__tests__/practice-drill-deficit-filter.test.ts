import {
  matchesDeficits,
  type DeficitTagIndex,
} from '../practice-drill-filter';
import {
  PracticeDrillDeficitPriority,
  type PracticeDrill,
  type PracticeDrillDeficitTag,
} from '../../types';
import { PracticeDrillVisibility } from '../../types/practice-drill';

function drill(id: string): PracticeDrill {
  return {
    id,
    teamId: null,
    visibility: PracticeDrillVisibility.SYSTEM,
    name: `drill-${id}`,
    skillCategories: [],
    positions: [],
    ageLevels: [],
    equipment: [],
    fieldSpaces: [],
    tags: [],
    createdAt: '2026-04-22T00:00:00Z',
    updatedAt: '2026-04-22T00:00:00Z',
  };
}

function tag(
  drillId: string,
  deficitId: string,
  priority: PracticeDrillDeficitPriority,
  teamId: string | null = null,
): PracticeDrillDeficitTag {
  return {
    id: `tag-${drillId}-${deficitId}-${teamId ?? 'system'}`,
    drillId,
    deficitId,
    teamId,
    priority,
    createdAt: '2026-04-22T00:00:00Z',
  };
}

function index(tags: PracticeDrillDeficitTag[]): DeficitTagIndex {
  const map = new Map<string, PracticeDrillDeficitTag[]>();
  for (const t of tags) {
    const list = map.get(t.drillId) ?? [];
    list.push(t);
    map.set(t.drillId, list);
  }
  return map;
}

describe('matchesDeficits', () => {
  it('passes when filters.deficitIds is undefined', () => {
    expect(matchesDeficits(drill('d1'), index([]), {})).toBe(true);
  });

  it('passes when filters.deficitIds is empty', () => {
    expect(matchesDeficits(drill('d1'), index([]), { deficitIds: [] })).toBe(true);
  });

  it('matches any of the requested deficit ids', () => {
    const tags = index([
      tag('d1', 'def-a', PracticeDrillDeficitPriority.SECONDARY),
    ]);
    expect(
      matchesDeficits(drill('d1'), tags, { deficitIds: ['def-a', 'def-b'] }),
    ).toBe(true);
  });

  it('rejects a drill with no matching tag', () => {
    const tags = index([
      tag('d1', 'def-c', PracticeDrillDeficitPriority.PRIMARY),
    ]);
    expect(
      matchesDeficits(drill('d1'), tags, { deficitIds: ['def-a'] }),
    ).toBe(false);
  });

  it('rejects a drill with no tags at all', () => {
    expect(
      matchesDeficits(drill('d1'), index([]), { deficitIds: ['def-a'] }),
    ).toBe(false);
  });

  it('primary-only: rejects drill whose only match is secondary', () => {
    const tags = index([
      tag('d1', 'def-a', PracticeDrillDeficitPriority.SECONDARY),
    ]);
    expect(
      matchesDeficits(drill('d1'), tags, {
        deficitIds: ['def-a'],
        deficitPriority: 'primary',
      }),
    ).toBe(false);
  });

  it('primary-only: passes drill with a primary match', () => {
    const tags = index([
      tag('d1', 'def-a', PracticeDrillDeficitPriority.PRIMARY),
      tag('d1', 'def-b', PracticeDrillDeficitPriority.SECONDARY),
    ]);
    expect(
      matchesDeficits(drill('d1'), tags, {
        deficitIds: ['def-a'],
        deficitPriority: 'primary',
      }),
    ).toBe(true);
  });

  it('treats system and team-scoped tags equivalently for matching', () => {
    const tags = index([
      tag('d1', 'def-a', PracticeDrillDeficitPriority.PRIMARY, 'team-1'),
    ]);
    expect(
      matchesDeficits(drill('d1'), tags, { deficitIds: ['def-a'] }),
    ).toBe(true);
  });
});
