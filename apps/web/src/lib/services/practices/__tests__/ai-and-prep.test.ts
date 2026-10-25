import { PracticeBlockType, aiPracticePreviewResponseSchema, prepPreviewResponseSchema } from '@baseball/shared';
import { createPracticeFromAiPlan, previewAiPractice } from '../ai-practice';
import { createPrepPracticeFromPlan, loadPrepPreview } from '../prep-practice';
import { fakeDb } from '../../__tests__/fake-db';

const mockGenerate = jest.fn();
const mockLog = jest.fn();
jest.mock('@/lib/ai/practice-generator', () => ({ generatePractice: (...args: unknown[]) => mockGenerate(...args) }));
jest.mock('@/lib/ai/log-generation', () => ({ logAiGeneration: (...args: unknown[]) => mockLog(...args) }));
jest.mock('@/lib/ai/client', () => ({ AI_MODELS: { opus: 'opus', sonnet: 'sonnet' } }));
const mockCreateAi = jest.fn();
const mockCreatePrep = jest.fn();
const mockNextGame = jest.fn();
jest.mock('@baseball/database', () => ({
  createAiPractice: (...args: unknown[]) => mockCreateAi(...args),
  createPrepPractice: (...args: unknown[]) => mockCreatePrep(...args),
  getNextGameForTeam: (...args: unknown[]) => mockNextGame(...args),
}));

const TEAM = '11111111-1111-4111-8111-111111111111';
const DRILL = '22222222-2222-4222-8222-222222222222';
const HIDDEN_DRILL = '33333333-3333-4333-8333-333333333333';
const GAME = '44444444-4444-4444-8444-444444444444';
const coach = { data: { role: 'head_coach' } };
const drillRow = { id: DRILL, team_id: null, visibility: 'system', name: 'Tee work', created_at: '', updated_at: '' };

const block = (drillId: string | null) => ({
  blockType: PracticeBlockType.WARMUP,
  title: 'Warmup',
  plannedDurationMinutes: 15,
  drillId,
  fieldSpaces: [],
  rationale: 'Get loose',
});
const plan = { focusSummary: 'Hitting', blocks: [block(DRILL), block(HIDDEN_DRILL)] };

beforeEach(() => {
  jest.clearAllMocks();
  mockLog.mockResolvedValue(undefined);
});

describe('previewAiPractice', () => {
  const input = { teamId: TEAM, coachPrompt: 'Lots of hitting today', durationMinutes: 90, playerCount: 12 };

  it("should draft a plan from the team's drills and log the generation", async () => {
    mockGenerate.mockResolvedValue({ plan, unknownDrillIds: [], durationMismatchWarning: null, usage: {} });
    const { db } = fakeDb({ 'team_members.select': coach, 'practice_drills.select': { data: [drillRow] } });
    const result = await previewAiPractice(db, 'c', input);
    if (!result.ok) throw new Error(result.error);

    expect(aiPracticePreviewResponseSchema.parse(result.data)).toEqual(result.data);
    expect(result.data.drillsById).toEqual({ [DRILL]: 'Tee work' });
    expect(mockGenerate).toHaveBeenCalledWith(expect.objectContaining({ coachPrompt: 'Lots of hitting today', availableFieldSpaces: expect.any(Array) }));
    expect(mockLog).toHaveBeenCalledWith(expect.objectContaining({ feature: 'practice_generator', status: 'success' }));
  });

  it('should refuse a player and a too-short description before calling the model', async () => {
    expect(await previewAiPractice(fakeDb({ 'team_members.select': { data: { role: 'player' } } }).db, 'p', input)).toMatchObject({ ok: false, code: 'forbidden' });
    expect(await previewAiPractice(fakeDb().db, 'c', { ...input, coachPrompt: 'hi' })).toMatchObject({ ok: false, code: 'invalid' });
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it('should log a failed generation and hide its detail', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockGenerate.mockRejectedValue(new Error('anthropic exploded'));
    const result = await previewAiPractice(fakeDb({ 'team_members.select': coach, 'practice_drills.select': { data: [] } }).db, 'c', input);
    expect(result).toEqual({ ok: false, code: 'failed', error: 'Something went wrong. Please try again.' });
    expect(mockLog).toHaveBeenCalledWith(expect.objectContaining({ status: 'error', errorMessage: 'anthropic exploded' }));
  });
});

describe('createPracticeFromAiPlan', () => {
  it("should drop drills the team can't see before saving", async () => {
    mockCreateAi.mockResolvedValue({ practiceId: 'p1' });
    const { db } = fakeDb({ 'team_members.select': coach, 'practice_drills.select': { data: [drillRow] } });
    const scheduledAt = new Date(Date.now() + 86_400_000).toISOString();
    expect(await createPracticeFromAiPlan(db, 'c', { teamId: TEAM, scheduledAt, durationMinutes: 90, plan })).toEqual({ ok: true, data: { practiceId: 'p1' } });
    const saved = mockCreateAi.mock.calls[0][1].plan;
    expect(saved.blocks.map((b: { drillId: string | null }) => b.drillId)).toEqual([DRILL, null]);
  });

  it('should refuse a date more than a year away', async () => {
    const scheduledAt = new Date(Date.now() + 400 * 86_400_000).toISOString();
    expect(await createPracticeFromAiPlan(fakeDb().db, 'c', { teamId: TEAM, scheduledAt, durationMinutes: 90, plan })).toMatchObject({ ok: false, code: 'invalid' });
  });
});

describe('loadPrepPreview', () => {
  it('should say there is no next game rather than fail', async () => {
    mockNextGame.mockResolvedValue(null);
    const result = await loadPrepPreview(fakeDb({ 'team_members.select': coach }).db, 'c', { teamId: TEAM });
    if (!result.ok) throw new Error(result.error);
    expect(prepPreviewResponseSchema.parse(result.data)).toEqual(result.data);
    expect(result.data).toMatchObject({ nextGame: null, durationMinutes: 90, blocks: [] });
  });

  it('should refuse a parent', async () => {
    expect(await loadPrepPreview(fakeDb({ 'team_members.select': { data: { role: 'parent' } } }).db, 'p', { teamId: TEAM })).toMatchObject({
      ok: false,
      code: 'forbidden',
    });
    expect(mockNextGame).not.toHaveBeenCalled();
  });
});

describe('createPrepPracticeFromPlan', () => {
  const prepBlock = (drillId?: string) => ({
    position: 0, blockType: PracticeBlockType.SITUATIONAL, title: 'Bunt D', plannedDurationMinutes: 20, drillId,
    rationale: 'They bunt', addressedDeficitIds: [], addressedTagValues: [],
  });
  const input = {
    teamId: TEAM, linkedGameId: GAME, scheduledAt: '2026-10-27T21:00:00.000Z', durationMinutes: 90, prepFocusSummary: 'Bunts',
    blocks: [prepBlock(DRILL), prepBlock(HIDDEN_DRILL)],
  };

  it("should link the team's game and drop drills the team can't see", async () => {
    mockCreatePrep.mockResolvedValue({ practiceId: 'p1' });
    const { db, calls } = fakeDb({
      'team_members.select': coach,
      'games.select': { data: { id: GAME } },
      'practice_drills.select': { data: [{ id: DRILL }] },
    });
    expect(await createPrepPracticeFromPlan(db, 'c', input)).toEqual({ ok: true, data: { practiceId: 'p1' } });
    expect(calls.find((c) => c.table === 'games')?.filters).toMatchObject({ id: GAME, team_id: TEAM });
    expect(mockCreatePrep.mock.calls[0][1].blocks.map((b: { drillId?: string }) => b.drillId)).toEqual([DRILL, undefined]);
  });

  it("should refuse another team's game", async () => {
    const { db } = fakeDb({ 'team_members.select': coach, 'games.select': { data: null } });
    expect(await createPrepPracticeFromPlan(db, 'c', input)).toMatchObject({ ok: false, code: 'not_found' });
    expect(mockCreatePrep).not.toHaveBeenCalled();
  });
});
