import type { JSX } from 'react';
import { Metadata } from 'next';
import Link from 'next/link';
import { createServerClient } from '@/lib/supabase/server';
import { getActiveTeam } from '@/lib/active-team';
import { getUserAccess } from '@/lib/user-access';
import { getTeamTier } from '@/lib/team-tier';
import {
  Feature,
  PracticeTemplate,
  PracticeTemplateKind,
  SEASON_PHASE_LABELS,
  TEMPLATE_KIND_LABELS,
  hasFeature,
} from '@baseball/shared';
import { listTemplates } from '@baseball/database';
import { createPracticeServiceClient } from '@/lib/practices/authz';

export const metadata: Metadata = { title: 'Practice templates' };

function groupByKind(templates: PracticeTemplate[]): Record<string, PracticeTemplate[]> {
  const groups: Record<string, PracticeTemplate[]> = {};
  for (const t of templates) {
    const key = t.kind;
    (groups[key] ??= []).push(t);
  }
  return groups;
}

export default async function TemplatesPage(): Promise<JSX.Element | null> {
  const auth = createServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) return null;

  const activeTeam = await getActiveTeam(auth, user.id);
  if (!activeTeam) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold text-gray-900">Practice templates</h1>
        <p className="text-gray-500 mt-2">No active team.</p>
      </div>
    );
  }

  const [{ isCoach }, tier] = await Promise.all([
    getUserAccess(activeTeam.id, user.id),
    getTeamTier(activeTeam.id),
  ]);
  if (!tier || !hasFeature(tier, Feature.PRACTICE_PLANNING)) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold text-gray-900">Practice templates</h1>
        <p className="text-gray-500 mt-2">Upgrade to access practice templates.</p>
      </div>
    );
  }

  const supabase = createPracticeServiceClient();
  const templates = await listTemplates(supabase, activeTeam.id);
  const groups = groupByKind(templates);

  const kindOrder = [
    PracticeTemplateKind.WEEKLY_RECURRING,
    PracticeTemplateKind.SEASONAL,
    PracticeTemplateKind.QUICK_90,
    PracticeTemplateKind.CUSTOM,
  ];

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Practice templates</h1>
          <p className="text-gray-500 text-sm">
            {templates.length} template{templates.length === 1 ? '' : 's'} · {activeTeam.name}
          </p>
        </div>
        {isCoach && (
          <Link
            href="/practices/templates/new"
            className="bg-brand-700 text-white font-semibold px-4 py-2 rounded-lg hover:bg-brand-800 text-sm"
          >
            + New template
          </Link>
        )}
      </div>

      {templates.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-300 px-6 py-16 text-center">
          <p className="text-gray-500 mb-2">No templates yet.</p>
          {isCoach && (
            <Link
              href="/practices/templates/new"
              className="text-brand-700 hover:underline text-sm"
            >
              Build your first template →
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {kindOrder.map((kind) => {
            const list = groups[kind] ?? [];
            if (list.length === 0) return null;
            return (
              <section key={kind}>
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  {TEMPLATE_KIND_LABELS[kind]}
                </h2>
                <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {list.map((t) => (
                    <li key={t.id}>
                      <Link
                        href={`/practices/templates/${t.id}/edit`}
                        className="block bg-white rounded-xl border border-gray-200 hover:border-brand-400 hover:shadow-sm transition-all p-4"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-semibold text-gray-900">{t.name}</h3>
                          {t.isIndoorFallback && (
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
                              Indoor
                            </span>
                          )}
                        </div>
                        {t.description && (
                          <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                            {t.description}
                          </p>
                        )}
                        <div className="text-xs text-gray-500 mt-2 flex flex-wrap gap-x-3">
                          <span>⏱ {t.defaultDurationMinutes} min</span>
                          <span>📅 {SEASON_PHASE_LABELS[t.seasonPhase]}</span>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
