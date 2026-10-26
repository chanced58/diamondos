import { CURRICULUM_VERSION, TRAINING_MODULES, completeTrainingModuleResponseSchema, trainingProgressResponseSchema } from '@baseball/shared';
import { completeTrainingModule, loadTrainingProgress } from '../training';
import { fakeDb } from '../../__tests__/fake-db';

const SLUGS = TRAINING_MODULES.map((m) => m.slug);
const completions = (slugs: string[]) => ({ data: slugs.map((module_slug) => ({ module_slug })) });

beforeEach(() => jest.clearAllMocks());

describe('loadTrainingProgress', () => {
  it("should read the user's completions in this curriculum, and offer training to coaching staff", async () => {
    const { db, calls } = fakeDb({
      'training_module_completions.select': completions([SLUGS[0]]),
      'user_certifications.select': { data: null },
      'team_members.select': { data: [{ role: 'parent' }, { role: 'scorekeeper' }] },
    });
    const result = await loadTrainingProgress(db, 'u1');
    if (!result.ok) throw new Error(result.error);

    expect(trainingProgressResponseSchema.parse(result.data)).toEqual({
      completedSlugs: [SLUGS[0]],
      isCertified: false,
      curriculumVersion: CURRICULUM_VERSION,
      offered: true,
    });
    expect(calls.find((c) => c.table === 'training_module_completions')?.filters).toEqual({ user_id: 'u1', curriculum_version: CURRICULUM_VERSION });
  });

  it('should not offer training to a parent, and hide a failure', async () => {
    const parent = fakeDb({
      'training_module_completions.select': completions([]),
      'user_certifications.select': { data: null },
      'team_members.select': { data: [{ role: 'parent' }] },
    });
    expect(await loadTrainingProgress(parent.db, 'p')).toMatchObject({ ok: true, data: { offered: false } });

    jest.spyOn(console, 'error').mockImplementation(() => {});
    const broken = fakeDb({ 'training_module_completions.select': { error: { message: 'boom' } } });
    expect(await loadTrainingProgress(broken.db, 'u1')).toEqual({ ok: false, code: 'failed', error: 'Something went wrong. Please try again.' });
  });
});

describe('completeTrainingModule', () => {
  it('should record the module once and point to the next one', async () => {
    const { db, calls } = fakeDb({
      'training_module_completions.select': completions([SLUGS[0]]),
      'user_certifications.select': { data: null },
      'team_members.select': { data: [{ role: 'head_coach' }] },
    });
    const result = await completeTrainingModule(db, 'u1', { slug: SLUGS[0] });
    if (!result.ok) throw new Error(result.error);

    expect(completeTrainingModuleResponseSchema.parse(result.data)).toMatchObject({ certifiedNow: false, nextSlug: SLUGS[1] });
    expect(calls.find((c) => c.op === 'upsert')?.payload).toEqual({ user_id: 'u1', module_slug: SLUGS[0], curriculum_version: CURRICULUM_VERSION });
    expect(calls.some((c) => c.table === 'user_certifications' && c.op === 'insert')).toBe(false);
  });

  it('should certify the user when the last module completes, and only once', async () => {
    const first = fakeDb({
      'training_module_completions.select': completions(SLUGS),
      'user_certifications.select': { data: null },
      'team_members.select': { data: [{ role: 'head_coach' }] },
    });
    const result = await completeTrainingModule(first.db, 'u1', { slug: SLUGS[SLUGS.length - 1] });
    expect(result).toMatchObject({ ok: true, data: { certifiedNow: true, nextSlug: null, progress: { isCertified: true } } });
    expect(first.calls.find((c) => c.table === 'user_certifications' && c.op === 'insert')?.payload).toEqual({ user_id: 'u1', curriculum_version: CURRICULUM_VERSION });

    const again = fakeDb({
      'training_module_completions.select': completions(SLUGS),
      'user_certifications.select': { data: { id: 'cert' } },
      'team_members.select': { data: [{ role: 'head_coach' }] },
    });
    expect(await completeTrainingModule(again.db, 'u1', { slug: SLUGS[0] })).toMatchObject({ ok: true, data: { certifiedNow: false } });
    expect(again.calls.some((c) => c.table === 'user_certifications' && c.op === 'insert')).toBe(false);
  });

  it('should refuse an unknown module before writing', async () => {
    const { db, calls } = fakeDb();
    expect(await completeTrainingModule(db, 'u1', { slug: 'not-a-module' })).toMatchObject({ ok: false, code: 'not_found' });
    expect(await completeTrainingModule(db, 'u1', { slug: '' })).toMatchObject({ ok: false, code: 'invalid' });
    expect(calls).toHaveLength(0);
  });
});
