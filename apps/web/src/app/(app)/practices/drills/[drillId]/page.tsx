import type { JSX } from 'react';
import { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  AGE_LEVEL_LABELS,
  DrillDeficitTagHydrated,
  EQUIPMENT_LABELS,
  FIELD_SPACE_LABELS,
  PracticeDrillDeficitPriority,
  PracticeDrillVisibility,
  SKILL_CATEGORY_LABELS,
} from '@baseball/shared';
import {
  getDrillAttachmentSignedUrl,
  getDrillById,
  listDrillAttachments,
  listDrillDeficitTags,
} from '@baseball/database';
import { createServerClient } from '@/lib/supabase/server';
import { getActiveTeam } from '@/lib/active-team';
import { getUserAccess } from '@/lib/user-access';
import { createPracticeServiceClient } from '@/lib/practices/authz';

export const metadata: Metadata = { title: 'Drill' };

interface Props {
  params: Promise<{ drillId: string }>;
}

export default async function DrillDetailPage({ params }: Props): Promise<JSX.Element> {
  const { drillId } = await params;
  const auth = createServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) notFound();

  const activeTeam = await getActiveTeam(auth, user.id);
  if (!activeTeam) notFound();
  const { isCoach } = await getUserAccess(activeTeam.id, user.id);

  const supabase = createPracticeServiceClient();
  const drill = await getDrillById(supabase, drillId);
  if (!drill) notFound();

  const isSystem = drill.visibility === PracticeDrillVisibility.SYSTEM;
  // Non-system drills are only visible to members of their owning team.
  if (!isSystem && drill.teamId !== activeTeam.id) notFound();
  const canEdit = isCoach && !isSystem && drill.teamId === activeTeam.id;

  const attachments = isSystem ? [] : await listDrillAttachments(supabase, drill.id);
  const signedAttachments = await Promise.all(
    attachments.map(async (a) => ({
      ...a,
      signedUrl: await getDrillAttachmentSignedUrl(supabase, a.storagePath),
    })),
  );

  const hydratedTags: DrillDeficitTagHydrated[] = await listDrillDeficitTags(
    supabase,
    drill.id,
    activeTeam.id,
  );
  const primaryDeficits = hydratedTags.filter(
    (t) => t.priority === PracticeDrillDeficitPriority.PRIMARY,
  );
  const secondaryDeficits = hydratedTags.filter(
    (t) => t.priority === PracticeDrillDeficitPriority.SECONDARY,
  );

  return (
    <div className="p-8 max-w-3xl">
      <Link href="/practices/drills" className="text-sm text-brand-700 hover:underline">
        ← Back to drill library
      </Link>

      <div className="flex items-start justify-between gap-4 mt-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{drill.name}</h1>
          <p className="text-xs uppercase tracking-wide font-semibold text-gray-500 mt-1">
            {isSystem ? 'Curated system drill' : 'Team drill'}
          </p>
        </div>
        {canEdit && (
          <Link
            href={`/practices/drills/${drill.id}/edit`}
            className="bg-white border border-gray-300 text-gray-700 font-semibold px-3 py-1.5 rounded-lg hover:bg-gray-50 text-sm"
          >
            Edit
          </Link>
        )}
      </div>

      {drill.description && (
        <p className="text-gray-700 mt-4 whitespace-pre-wrap">{drill.description}</p>
      )}

      <section className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        {drill.defaultDurationMinutes !== undefined && (
          <Stat label="Duration" value={`${drill.defaultDurationMinutes} min`} />
        )}
        {drill.minPlayers !== undefined && (
          <Stat
            label="Players"
            value={
              drill.maxPlayers && drill.maxPlayers !== drill.minPlayers
                ? `${drill.minPlayers}–${drill.maxPlayers}`
                : String(drill.minPlayers)
            }
          />
        )}
        {drill.positions.length > 0 && (
          <Stat label="Positions" value={drill.positions.join(', ')} />
        )}
        <Stat
          label="Ages"
          value={drill.ageLevels.map((a) => AGE_LEVEL_LABELS[a] ?? a).join(', ')}
        />
      </section>

      <TagSection title="Skills">
        {drill.skillCategories.map((sc) => (
          <Tag key={sc}>{SKILL_CATEGORY_LABELS[sc] ?? sc}</Tag>
        ))}
      </TagSection>

      {(primaryDeficits.length > 0 || secondaryDeficits.length > 0) && (
        <section className="mt-6 bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Fixes</h2>
          {primaryDeficits.length > 0 && (
            <>
              <h3 className="text-xs uppercase tracking-wide font-semibold text-gray-500 mb-1">
                Primary
              </h3>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {primaryDeficits.map((t) => (
                  <span
                    key={t.tagId}
                    className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-800"
                    title={t.deficit.description ?? t.deficit.name}
                  >
                    {t.deficit.name}
                  </span>
                ))}
              </div>
            </>
          )}
          {secondaryDeficits.length > 0 && (
            <>
              <h3 className="text-xs uppercase tracking-wide font-semibold text-gray-500 mb-1">
                Secondary
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {secondaryDeficits.map((t) => (
                  <span
                    key={t.tagId}
                    className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-50 text-gray-700"
                    title={t.deficit.description ?? t.deficit.name}
                  >
                    {t.deficit.name}
                  </span>
                ))}
              </div>
            </>
          )}
        </section>
      )}

      {drill.equipment.length > 0 && (
        <TagSection title="Equipment">
          {drill.equipment.map((eq) => (
            <Tag key={eq}>{EQUIPMENT_LABELS[eq] ?? eq}</Tag>
          ))}
        </TagSection>
      )}

      {drill.fieldSpaces.length > 0 && (
        <TagSection title="Field space">
          {drill.fieldSpaces.map((fs) => (
            <Tag key={fs}>{FIELD_SPACE_LABELS[fs] ?? fs}</Tag>
          ))}
        </TagSection>
      )}

      {drill.tags.length > 0 && (
        <TagSection title="Tags">
          {drill.tags.map((t) => (
            <Tag key={t}>#{t}</Tag>
          ))}
        </TagSection>
      )}

      {drill.coachingPoints && (
        <section className="mt-6 bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-2">Coaching points</h2>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{drill.coachingPoints}</p>
        </section>
      )}

      {(drill.diagramUrl || drill.videoUrl || signedAttachments.length > 0) && (
        <section className="mt-6 bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-2">Media</h2>
          <ul className="space-y-1 text-sm">
            {drill.videoUrl && (
              <li>
                <a
                  href={drill.videoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-700 hover:underline"
                >
                  ▶ Video
                </a>
              </li>
            )}
            {drill.diagramUrl && (
              <li>
                <a
                  href={drill.diagramUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-700 hover:underline"
                >
                  📄 Diagram
                </a>
              </li>
            )}
            {signedAttachments.map((a) => (
              <li key={a.id}>
                <a
                  href={a.signedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-700 hover:underline"
                >
                  📎 {a.kind} attachment
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {drill.source && (
        <p className="mt-6 text-xs text-gray-400">Source: {drill.source}</p>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-gray-500">{label}</p>
      <p className="font-medium text-gray-900">{value}</p>
    </div>
  );
}

function TagSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5">
      <h2 className="text-xs uppercase tracking-wide font-semibold text-gray-500 mb-2">
        {title}
      </h2>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </section>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700">
      {children}
    </span>
  );
}
