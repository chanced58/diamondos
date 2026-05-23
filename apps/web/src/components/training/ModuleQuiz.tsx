'use client';
import { useState } from 'react';
import type { JSX } from 'react';
import { useRouter } from 'next/navigation';
import type { QuizQuestion } from '@baseball/shared';

type ServerSubmitFn = (
  slug: string,
) => Promise<{ ok: true; certifiedNow: boolean; nextSlug: string | null } | { ok: false; error: string }>;

interface ModuleQuizProps {
  slug: string;
  quiz: readonly QuizQuestion[];
  submitAction: ServerSubmitFn;
}

type Result = 'unanswered' | 'right' | 'wrong';

export function ModuleQuiz({ slug, quiz, submitAction }: ModuleQuizProps): JSX.Element {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Record<string, Result>>({});
  const [checked, setChecked] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitMsg, setSubmitMsg] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const allAnswered = quiz.every((q) => answers[q.id]);
  const allCorrect = quiz.every((q) => results[q.id] === 'right');

  function pick(qid: string, optId: string): void {
    setAnswers((prev) => ({ ...prev, [qid]: optId }));
    setResults((prev) => ({ ...prev, [qid]: 'unanswered' }));
    setChecked(false);
    setSubmitMsg(null);
  }

  function check(): void {
    const next: Record<string, Result> = {};
    for (const q of quiz) {
      const a = answers[q.id];
      next[q.id] = a == null ? 'unanswered' : a === q.correctOptionId ? 'right' : 'wrong';
    }
    setResults(next);
    setChecked(true);
  }

  async function submit(): Promise<void> {
    setServerError(null);
    setPending(true);
    try {
      const res = await submitAction(slug);
      if (!res.ok) {
        setServerError(res.error);
        return;
      }
      setSubmitMsg(
        res.certifiedNow
          ? 'Module complete — you are now DiamondOS Certified!'
          : 'Module complete.',
      );
      if (res.nextSlug) {
        router.push(`/training/${res.nextSlug}`);
      } else {
        router.push('/training');
      }
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {quiz.map((q, idx) => {
        const result = results[q.id] ?? 'unanswered';
        return (
          <fieldset
            key={q.id}
            style={{
              border: '1px solid var(--app-border, rgba(0,0,0,.1))',
              borderRadius: 10,
              padding: 14,
              margin: 0,
            }}
          >
            <legend style={{ fontWeight: 600, padding: '0 6px' }}>
              Question {idx + 1}
            </legend>
            <p style={{ marginTop: 0, marginBottom: 10 }}>{q.prompt}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {q.options.map((opt) => {
                const selected = answers[q.id] === opt.id;
                return (
                  <label
                    key={opt.id}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 8,
                      padding: '6px 8px',
                      borderRadius: 6,
                      cursor: 'pointer',
                      background: selected ? 'rgba(37,99,235,.08)' : 'transparent',
                    }}
                  >
                    <input
                      type="radio"
                      name={q.id}
                      value={opt.id}
                      checked={selected}
                      onChange={() => pick(q.id, opt.id)}
                      style={{ marginTop: 3 }}
                    />
                    <span>{opt.label}</span>
                  </label>
                );
              })}
            </div>
            {checked && result !== 'unanswered' && (
              <p
                style={{
                  marginTop: 10,
                  marginBottom: 0,
                  padding: '8px 10px',
                  borderRadius: 6,
                  background:
                    result === 'right' ? 'rgba(16,185,129,.10)' : 'rgba(220,38,38,.10)',
                  color: result === 'right' ? '#047857' : '#b91c1c',
                  fontSize: 14,
                }}
              >
                <strong>{result === 'right' ? '✓ Correct.' : '✕ Not quite.'}</strong>{' '}
                {q.explanation}
              </p>
            )}
          </fieldset>
        );
      })}

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          type="button"
          className="btn"
          onClick={check}
          disabled={!allAnswered}
          style={{ padding: '8px 14px' }}
        >
          Check answers
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => { void submit(); }}
          disabled={!allCorrect || pending}
          style={{ padding: '8px 14px' }}
        >
          {pending ? 'Saving…' : 'Submit & complete module'}
        </button>
        {checked && !allCorrect && (
          <span style={{ color: '#b91c1c', fontSize: 14 }}>
            Fix the wrong answers above, then submit.
          </span>
        )}
        {submitMsg && (
          <span style={{ color: '#047857', fontSize: 14 }}>{submitMsg}</span>
        )}
        {serverError && (
          <span style={{ color: '#b91c1c', fontSize: 14 }}>{serverError}</span>
        )}
      </div>
    </div>
  );
}
