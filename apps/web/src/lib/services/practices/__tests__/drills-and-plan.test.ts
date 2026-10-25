import { PracticeBlockType, SubscriptionTier, drillDetailResponseSchema, drillsListResponseSchema } from '@baseball/shared';
import { createTeamDrill, deleteTeamDrill, listTeamDrills, loadDrill, updateTeamDrill } from '../drills';
import { planPractice } from '../plan-practice';
import { fakeDb } from '../../__tests__/fake-db';

const mockResolveTeamTier = jest.fn();
jest.mock('@/lib/team-tier', () => ({ resolveTeamTier: (...args: unknown[]) => mockResolveTeamTier(...args) }));
const mockListDrills = jest.fn();
const mockGetDrill = jest.fn();
const mockCreateDrill = jest.fn();
const mockUpdateDrill = jest.fn();
const mockDeleteDrill = jest.fn();
const mockDeficitTags = jest.fn();
jest.mock('@baseball/database', () => ({
  listDrills: (...args: unknown[]) => mockListDrills(...args),
  getDrillById: (...args: unknown[]) => mockGetDrill(...args),
  createDrill: (...args: unknown[]) => mockCreateDrill(...args),
  updateDrill: (...args: unknown[]) => mockUpdateDrill(...args),
  deleteDrill: (...args: unknown[]) => mockDeleteDrill(...args),
  listDrillDeficitTags: (...args: unknown[]) => mockDeficitTags(...args),
}));

const TEAM = '11111111-1111-4111-8111-111111111111';
const OTHER_TEAM = '22222222-2222-4222-8222-222222222222';
const DRILL = '33333333-3333-4333-8333-333333333333';
const HIDDEN_DRILL = '44444444-4444-4444-8444-444444444444';
const member = (role: string) => ({ data: { role, is_active: true } });

const drill = (overrides: Record<string, unknown> = {}) => ({
  id: DRILL,
  teamId: TEAM,
  visibility: 'team',
  name: 'Soft toss',
  skillCategories: ['hitting'],
  positions: [],
  ageLevels: ['all'],
  equipment: [],
  fieldSpaces: [],
  tags: [],
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-01T00:00:00Z',
  ...overrides,
});
const form = { name: 'Soft toss', skillCategories: ['hitting'], description: '' };

beforeEach(() => {
  jest.clearAllMocks();
  mockResolveTeamTier.mockResolvedValue(SubscriptionTier.PRO);
});

describe('listTeamDrills', () => {
  it('should list the library for any member and say whether they coach', async () => {
    mockListDrills.mockResolvedValue([drill(), drill({ id: HIDDEN_DRILL, teamId: null, visibility: 'system', name: 'Tee work' })]);
    const result = await listTeamDrills(fakeDb({ 'team_members.select': member('parent') }).db, 'p', { teamId: TEAM });
    if (!result.ok) throw new Error(result.error);
    expect(drillsListResponseSchema.parse(result.data)).toMatchObject({ teamId: TEAM, isCoach: false });
    expect(result.data.drills).toHaveLength(2);
  });

  it('should refuse a team without practice planning and an outsider', async () => {
    mockResolveTeamTier.mockResolvedValue(SubscriptionTier.FREE);
    expect(await listTeamDrills(fakeDb({ 'team_members.select': member('head_coach') }).db, 'c', { teamId: TEAM })).toMatchObject({ ok: false, code: 'forbidden' });
    expect(await listTeamDrills(fakeDb({ 'team_members.select': { data: null } }).db, 'x', { teamId: TEAM })).toMatchObject({ ok: false, code: 'not_found' });
    expect(mockListDrills).not.toHaveBeenCalled();
  });
});

describe('loadDrill', () => {
  it("should show a coach their team's drill as editable, with its fixes", async () => {
    mockGetDrill.mockResolvedValue(drill());
    mockDeficitTags.mockResolvedValue([
      { tagId: 'a', priority: 'primary', deficit: { id: 'd1', name: 'Late swing' } },
      { tagId: 'b', priority: 'secondary', deficit: { id: 'd2', name: 'Pull side' } },
    ]);
    const result = await loadDrill(fakeDb({ 'team_members.select': member('assistant_coach') }).db, 'c', { teamId: TEAM, drillId: DRILL });
    if (!result.ok) throw new Error(result.error);
    expect(drillDetailResponseSchema.parse(result.data)).toMatchObject({
      canEdit: true,
      fixes: { primary: [{ id: 'd1', name: 'Late swing' }], secondary: [{ id: 'd2', name: 'Pull side' }] },
    });
  });

  it('should never offer to edit a curated drill, nor to a player', async () => {
    mockDeficitTags.mockResolvedValue([]);
    mockGetDrill.mockResolvedValue(drill({ teamId: null, visibility: 'system' }));
    const curated = await loadDrill(fakeDb({ 'team_members.select': member('head_coach') }).db, 'c', { teamId: TEAM, drillId: DRILL });
    expect(curated).toMatchObject({ ok: true, data: { canEdit: false } });

    mockGetDrill.mockResolvedValue(drill());
    const player = await loadDrill(fakeDb({ 'team_members.select': member('player') }).db, 'p', { teamId: TEAM, drillId: DRILL });
    expect(player).toMatchObject({ ok: true, data: { canEdit: false } });
  });

  it("should hide another team's drill", async () => {
    mockGetDrill.mockResolvedValue(drill({ teamId: OTHER_TEAM }));
    const result = await loadDrill(fakeDb({ 'team_members.select': member('head_coach') }).db, 'c', { teamId: TEAM, drillId: DRILL });
    expect(result).toMatchObject({ ok: false, code: 'not_found' });
    expect(mockDeficitTags).not.toHaveBeenCalled();
  });
});

describe('team drill writes', () => {
  it("should add a coach's drill to the team and clear blank fields", async () => {
    mockCreateDrill.mockResolvedValue({ id: DRILL });
    const { db } = fakeDb({ 'team_members.select': member('head_coach') });
    expect(await createTeamDrill(db, 'c', { teamId: TEAM, drill: form })).toEqual({ ok: true, data: { drillId: DRILL } });
    expect(mockCreateDrill).toHaveBeenCalledWith(db, expect.objectContaining({ teamId: TEAM, name: 'Soft toss', createdBy: 'c', diagramUrl: undefined }));
  });

  it('should refuse a player, and a drill without a skill category', async () => {
    expect(await createTeamDrill(fakeDb({ 'team_members.select': member('player') }).db, 'p', { teamId: TEAM, drill: form })).toMatchObject({ ok: false, code: 'forbidden' });
    expect(await createTeamDrill(fakeDb().db, 'c', { teamId: TEAM, drill: { ...form, skillCategories: [] } })).toMatchObject({ ok: false, code: 'invalid' });
    expect(mockCreateDrill).not.toHaveBeenCalled();
  });

  it("should edit and delete against the drill's own team", async () => {
    mockGetDrill.mockResolvedValue(drill());
    const coach = fakeDb({ 'team_members.select': member('assistant_coach') });
    expect(await updateTeamDrill(coach.db, 'c', { drillId: DRILL, drill: form })).toEqual({ ok: true, data: { drillId: DRILL } });
    // Every column is sent, so a field left blank is cleared rather than kept.
    expect(mockUpdateDrill.mock.calls[0][2]).toHaveProperty('coachingPoints', undefined);
    expect(coach.calls.find((c) => c.table === 'team_members')?.filters).toMatchObject({ team_id: TEAM });

    const outsider = fakeDb({ 'team_members.select': { data: null } });
    expect(await deleteTeamDrill(outsider.db, 'x', { drillId: DRILL })).toMatchObject({ ok: false, code: 'forbidden' });
    expect(mockDeleteDrill).not.toHaveBeenCalled();
  });

  it('should never change a curated drill', async () => {
    mockGetDrill.mockResolvedValue(drill({ teamId: null, visibility: 'system' }));
    const { db } = fakeDb({ 'team_members.select': member('head_coach') });
    expect(await updateTeamDrill(db, 'c', { drillId: DRILL, drill: form })).toMatchObject({ ok: false, code: 'forbidden' });
    expect(await deleteTeamDrill(db, 'c', { drillId: DRILL })).toMatchObject({ ok: false, code: 'forbidden' });
    expect(mockUpdateDrill).not.toHaveBeenCalled();
    expect(mockDeleteDrill).not.toHaveBeenCalled();
  });
});

describe('planPractice', () => {
  const scheduledAt = () => new Date(Date.now() + 86_400_000).toISOString();

  it('should create the practice, save the plan, and add a block per visible drill in order', async () => {
    const { db, calls } = fakeDb({
      'team_members.select': member('head_coach'),
      'practices.insert': { data: { id: 'p1' } },
      'practice_drills.select': { data: [{ id: DRILL, name: 'Soft toss', default_duration_minutes: null }] },
    });
    const result = await planPractice(db, 'c', {
      teamId: TEAM,
      scheduledAt: scheduledAt(),
      durationMinutes: 90,
      location: '  ',
      plan: ' Work on timing ',
      drillIds: [HIDDEN_DRILL, DRILL, DRILL],
    });
    expect(result).toEqual({ ok: true, data: { practiceId: 'p1' } });

    expect(calls.find((c) => c.table === 'practices')?.payload).toMatchObject({ team_id: TEAM, location: null, created_by: 'c' });
    expect(calls.find((c) => c.table === 'practice_notes')?.payload).toMatchObject({ practice_id: 'p1', coach_notes: 'Work on timing', updated_by: 'c' });
    const drillsQuery = calls.find((c) => c.table === 'practice_drills');
    expect(drillsQuery?.filters).toMatchObject({ id: [HIDDEN_DRILL, DRILL], or: `team_id.eq.${TEAM},visibility.eq.system` });
    expect(calls.find((c) => c.table === 'practice_blocks')?.payload).toEqual([
      expect.objectContaining({ practice_id: 'p1', position: 0, block_type: PracticeBlockType.CUSTOM, title: 'Soft toss', planned_duration_minutes: 10, drill_id: DRILL }),
    ]);
  });

  it('should skip the notes and blocks when there is no plan or drill', async () => {
    const { db, calls } = fakeDb({ 'team_members.select': member('head_coach'), 'practices.insert': { data: { id: 'p1' } } });
    expect(await planPractice(db, 'c', { teamId: TEAM, scheduledAt: scheduledAt() })).toEqual({ ok: true, data: { practiceId: 'p1' } });
    expect(calls.map((c) => c.table)).not.toContain('practice_notes');
    expect(calls.map((c) => c.table)).not.toContain('practice_blocks');
  });

  it('should refuse a parent, a team without practice planning, and a date more than a year away', async () => {
    expect(await planPractice(fakeDb({ 'team_members.select': member('parent') }).db, 'p', { teamId: TEAM, scheduledAt: scheduledAt() })).toMatchObject({ ok: false, code: 'forbidden' });
    mockResolveTeamTier.mockResolvedValue(SubscriptionTier.FREE);
    expect(await planPractice(fakeDb({ 'team_members.select': member('head_coach') }).db, 'c', { teamId: TEAM, scheduledAt: scheduledAt() })).toMatchObject({ ok: false, code: 'forbidden' });
    const farAway = new Date(Date.now() + 400 * 86_400_000).toISOString();
    expect(await planPractice(fakeDb().db, 'c', { teamId: TEAM, scheduledAt: farAway })).toMatchObject({ ok: false, code: 'invalid' });
  });
});
