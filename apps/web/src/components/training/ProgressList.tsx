import type { JSX } from 'react';
import Link from 'next/link';
import type { TrainingModule } from '@baseball/shared';

interface ProgressListProps {
  modules: readonly TrainingModule[];
  completedSlugs: readonly string[];
  activeSlug?: string;
}

export function ProgressList({
  modules,
  completedSlugs,
  activeSlug,
}: ProgressListProps): JSX.Element {
  const done = new Set(completedSlugs);
  return (
    <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
      {modules.map((m, i) => {
        const isDone = done.has(m.slug);
        const isActive = m.slug === activeSlug;
        return (
          <li key={m.slug}>
            <Link
              href={`/training/${m.slug}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 10px',
                borderRadius: 8,
                textDecoration: 'none',
                color: 'inherit',
                background: isActive ? 'rgba(37,99,235,.10)' : 'transparent',
                border: isActive ? '1px solid rgba(37,99,235,.30)' : '1px solid transparent',
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  background: isDone ? '#10b981' : 'rgba(0,0,0,.06)',
                  color: isDone ? 'white' : 'inherit',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 13,
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                {isDone ? '✓' : i + 1}
              </span>
              <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <span style={{ fontWeight: isActive ? 600 : 500 }}>{m.title}</span>
                <span style={{ fontSize: 12, opacity: 0.65 }}>{m.estimatedMinutes} min</span>
              </span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
