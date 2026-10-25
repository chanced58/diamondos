import { practiceSummaryResponseSchema, practiceTemplatesResponseSchema } from '@baseball/shared';
import { generatePracticeSummary, loadPracticeSummary } from '../practice-summary';
import { applyPracticeTemplate, archivePracticeTemplate, duplicatePracticeTemplate, listPracticeTemplates } from '../practice-templates';
import { fakeDb } from '../../__tests__/fake-db';

const mockSummarize = jest.fn();
const mockLog = jest.fn();
jest.mock('@/lib/ai/practice-summary', () => ({ summarizePractice: (...args: unknown[]) => mockSummarize(...args) }));
jest.mock('@/lib/ai/log-generation', () => ({ logAiGeneration: (...args: unknown[]) => mockLog(...args) }));
jest.mock('@/lib/ai/client', () => ({ AI_MODELS: { opus: 'opus', sonnet: 'sonnet' } }));
const mockGetSummary = jest.fn();
const mockUpsertSummary = jest.fn();
const mockAttendance = jest.fn();
const mockListTemplates = jest.fn();
const mockDuplicate = jest.fn();
const mockArchive = jest.fn();
const mockInstantiate = jest.fn();
jest.mock('@baseball/database', () => ({
  getPracticeSummary: (...args: unknown[]) => mockGetSummary(...args),
  upsertPracticeSummary: (...args: unknown[]) => mockUpsertSummary(...args),
  listPracticeAttendance: (...args: unknown[]) => mockAttendance(...args),
  listTemplates: (...args: unknown[]) => mockListTemplates(...args),
  duplicateTemplate: (...args: unknown[]) => mockDuplicate(...args),
  archiveTemplate: (...args: unknown[]) => mockArchive(...args),
  instantiatePracticeFromTemplate: (...args: unknown[]) => mockInstantiate(...args),
}));

const TEAM = '11111111-1111-4111-8111-111111111111';
const PRACTICE = '22222222-2222-4222-8222-222222222222';
const TEMPLATE = '33333333-3333-4333-8333-333333333333';
const SAM = '44444444-4444-4444-8444-444444444444';
const GHOST = '55555555-5555-4555-8555-555555555555';

const practiceRow = { data: { id: PRACTICE, team_id: TEAM, scheduled_at: '2026-10-25T23:00:00Z', duration_minutes: 90, prep_focus_summary: null, status: 'scheduled', latitude: null, longitude: null } };
const member = (role: string) => ({ data: { role, is_active: true } });

beforeEach(() => {
  jest.clearAllMocks();
  mockLog.mockResolvedValue(undefined);
  mockAttendance.mockResolvedValue([]);
});

describe('practice summary', () => {
  it('should show coaches the saved summary and refuse a parent', async () => {
    mockGetSummary.mockResolvedValue(null);
    const coach = await loadPracticeSummary(fakeDb({ 'practices.select': practiceRow, 'team_members.select': member('assistant_coach') }).db, 'c', { practiceId: PRACTICE });
    if (!coach.ok) throw new Error(coach.error);
    expect(practiceSummaryResponseSchema.parse(coach.data)).toEqual({ summary: null });

    expect(await loadPracticeSummary(fakeDb({ 'practices.select': practiceRow, 'team_members.select': member('parent') }).db, 'p', { practiceId: PRACTICE }))
      .toMatchObject({ ok: false, code: 'forbidden' });
    expect(mockGetSummary).toHaveBeenCalledTimes(1);
  });

  it('should drop players the model made up before saving', async () => {
    mockSummarize.mockResolvedValue({
      model: 'sonnet',
      usage: {},
      summary: {
        coachRecap: 'Good day',
        standoutPlayers: [{ playerId: SAM, reason: 'Raked' }, { playerId: GHOST, reason: '?' }],
        concerns: [{ playerId: GHOST, note: 'Who?' }],
        playerSummaries: { [SAM]: 'Great', [GHOST]: '?' },
      },
    });
    mockUpsertSummary.mockImplementation((_db, args) => ({ id: 's1', practiceId: PRACTICE, teamId: TEAM, model: 'sonnet', generatedAt: 'now', ...args.summary }));
    const { db } = fakeDb({
      'practices.select': practiceRow,
      'team_members.select': member('head_coach'),
      'players.select': { data: [{ id: SAM, first_name: 'Sam', last_name: 'Lee', jersey_number: 7 }] },
    });
    const result = await generatePracticeSummary(db, 'c', { practiceId: PRACTICE });
    if (!result.ok) throw new Error(result.error);

    const saved = mockUpsertSummary.mock.calls[0][1].summary;
    expect(saved.standoutPlayers).toEqual([{ playerId: SAM, reason: 'Raked' }]);
    expect(saved.concerns).toEqual([{ playerId: null, note: 'Who?' }]);
    expect(Object.keys(saved.playerSummaries)).toEqual([SAM]);
    expect(practiceSummaryResponseSchema.parse(result.data).summary?.coachRecap).toBe('Good day');
  });
});

describe('practice templates', () => {
  const template = { data: { team_id: TEAM } };

  it("should list the team's templates for a coach", async () => {
    mockListTemplates.mockResolvedValue([
      { id: TEMPLATE, name: 'Tuesday', kind: 'weekly_recurring', seasonPhase: 'in_season', defaultDurationMinutes: 120, isIndoorFallback: false },
    ]);
    const result = await listPracticeTemplates(fakeDb({ 'team_members.select': member('assistant_coach') }).db, 'c', { teamId: TEAM });
    if (!result.ok) throw new Error(result.error);
    expect(practiceTemplatesResponseSchema.parse(result.data).templates).toEqual([
      { id: TEMPLATE, name: 'Tuesday', description: null, kind: 'weekly_recurring', seasonPhase: 'in_season', defaultDurationMinutes: 120, isIndoorFallback: false },
    ]);
  });

  it("should duplicate and archive against the template's own team", async () => {
    mockDuplicate.mockResolvedValue({ id: 'copy' });
    const coachOfTemplateTeam = fakeDb({ 'practice_templates.select': template, 'team_members.select': member('assistant_coach') });
    expect(await duplicatePracticeTemplate(coachOfTemplateTeam.db, 'c', { templateId: TEMPLATE, newName: ' Tuesday copy ' })).toEqual({
      ok: true,
      data: { templateId: 'copy' },
    });
    expect(mockDuplicate).toHaveBeenCalledWith(coachOfTemplateTeam.db, TEMPLATE, 'Tuesday copy', 'c');
    expect(coachOfTemplateTeam.calls.find((c) => c.table === 'team_members')?.filters).toMatchObject({ team_id: TEAM });

    const outsider = fakeDb({ 'practice_templates.select': template, 'team_members.select': { data: null } });
    expect(await archivePracticeTemplate(outsider.db, 'x', { templateId: TEMPLATE })).toMatchObject({ ok: false, code: 'forbidden' });
    expect(mockArchive).not.toHaveBeenCalled();
  });

  it('should let a head coach apply a template of the same team, and refuse an assistant', async () => {
    const headCoach = fakeDb({ 'practices.select': practiceRow, 'team_members.select': member('head_coach'), 'practice_templates.select': template });
    expect(await applyPracticeTemplate(headCoach.db, 'hc', { practiceId: PRACTICE, templateId: TEMPLATE })).toEqual({ ok: true, data: { practiceId: PRACTICE } });
    expect(mockInstantiate).toHaveBeenCalledWith(headCoach.db, { practiceId: PRACTICE, templateId: TEMPLATE });

    const assistant = fakeDb({ 'practices.select': practiceRow, 'team_members.select': member('assistant_coach') });
    expect(await applyPracticeTemplate(assistant.db, 'a', { practiceId: PRACTICE, templateId: TEMPLATE })).toMatchObject({ ok: false, code: 'forbidden' });
  });

  it("should refuse another team's template", async () => {
    const { db } = fakeDb({
      'practices.select': practiceRow,
      'team_members.select': member('head_coach'),
      'practice_templates.select': { data: { team_id: 'other-team' } },
    });
    expect(await applyPracticeTemplate(db, 'hc', { practiceId: PRACTICE, templateId: TEMPLATE })).toMatchObject({ ok: false, code: 'not_found' });
    expect(mockInstantiate).not.toHaveBeenCalled();
  });
});
