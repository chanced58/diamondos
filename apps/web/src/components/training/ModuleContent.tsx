import type { JSX } from 'react';
import type { TrainingSection } from '@baseball/shared';

export function ModuleContent({ sections }: { sections: readonly TrainingSection[] }): JSX.Element {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {sections.map((section, i) => {
        if (section.kind === 'prose') {
          return (
            <section key={i}>
              <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 6 }}>{section.heading}</h3>
              <p style={{ lineHeight: 1.55, color: 'var(--app-text, inherit)' }}>{section.body}</p>
            </section>
          );
        }
        if (section.kind === 'list') {
          return (
            <section key={i}>
              <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 6 }}>{section.heading}</h3>
              <ul style={{ paddingLeft: 22, lineHeight: 1.55 }}>
                {section.items.map((item, j) => (
                  <li key={j} style={{ marginBottom: 4 }}>{item}</li>
                ))}
              </ul>
            </section>
          );
        }
        const tone = section.tone === 'warning' ? 'warning' : 'info';
        return (
          <aside
            key={i}
            className={`callout callout-${tone}`}
            style={{
              padding: '12px 14px',
              borderRadius: 10,
              borderLeft: `4px solid ${tone === 'warning' ? '#d97706' : '#2563eb'}`,
              background: tone === 'warning' ? 'rgba(217,119,6,.08)' : 'rgba(37,99,235,.08)',
            }}
          >
            <p style={{ margin: 0, lineHeight: 1.5 }}>{section.body}</p>
          </aside>
        );
      })}
    </div>
  );
}
