import {
  CURRICULUM_VERSION,
  TRAINING_MODULES,
  isCurriculumComplete,
  type TrainingModule,
} from '..';

describe('training curriculum', () => {
  it('declares a CURRICULUM_VERSION', () => {
    expect(typeof CURRICULUM_VERSION).toBe('string');
    expect(CURRICULUM_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('has at least one module', () => {
    expect(TRAINING_MODULES.length).toBeGreaterThan(0);
  });

  it('uses unique, URL-safe slugs', () => {
    const slugs = TRAINING_MODULES.map((m) => m.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) {
      expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it.each(TRAINING_MODULES as readonly TrainingModule[])(
    'module "$slug" has a title, summary, sections, and >=3 quiz questions',
    (mod) => {
      expect(mod.title.trim().length).toBeGreaterThan(0);
      expect(mod.summary.trim().length).toBeGreaterThan(0);
      expect(mod.sections.length).toBeGreaterThan(0);
      expect(mod.quiz.length).toBeGreaterThanOrEqual(3);
      expect(mod.estimatedMinutes).toBeGreaterThan(0);
    },
  );

  it.each(TRAINING_MODULES as readonly TrainingModule[])(
    'module "$slug" quiz questions are internally consistent',
    (mod) => {
      const ids = mod.quiz.map((q) => q.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const q of mod.quiz) {
        expect(q.options.length).toBeGreaterThanOrEqual(2);
        const optionIds = q.options.map((o) => o.id);
        expect(new Set(optionIds).size).toBe(optionIds.length);
        expect(optionIds).toContain(q.correctOptionId);
        expect(q.explanation.trim().length).toBeGreaterThan(0);
      }
    },
  );
});

describe('isCurriculumComplete', () => {
  const allSlugs = TRAINING_MODULES.map((m) => m.slug);

  it('returns false when no modules are completed', () => {
    expect(isCurriculumComplete([])).toBe(false);
  });

  it('returns false for a strict subset', () => {
    expect(isCurriculumComplete(allSlugs.slice(0, -1))).toBe(false);
  });

  it('returns true when every required slug is present', () => {
    expect(isCurriculumComplete(allSlugs)).toBe(true);
  });

  it('returns true even with stale/extra slugs in the input', () => {
    expect(isCurriculumComplete([...allSlugs, 'retired-module'])).toBe(true);
  });

  it('ignores order and duplicates in the input', () => {
    expect(isCurriculumComplete([...allSlugs, ...allSlugs].reverse())).toBe(true);
  });
});
