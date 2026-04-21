import type { JSX } from 'react';
import { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { getActiveTeam } from '@/lib/active-team';
import { getUserAccess } from '@/lib/user-access';
import {
  getTemplateWithBlocks,
  listDrills,
  listTemplates,
} from '@baseball/database';
import { createPracticeServiceClient } from '@/lib/practices/authz';
import { TemplateBuilderForm } from '../../TemplateBuilderForm';

export const metadata: Metadata = { title: 'Edit template' };

interface Props {
  params: Promise<{ templateId: string }>;
}

export default async function EditTemplatePage({ params }: Props): Promise<JSX.Element> {
  const { templateId } = await params;
  const auth = createServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) redirect('/sign-in');
  const activeTeam = await getActiveTeam(auth, user.id);
  if (!activeTeam) notFound();
  const { isCoach } = await getUserAccess(activeTeam.id, user.id);
  if (!isCoach) redirect('/practices/templates');

  const supabase = createPracticeServiceClient();
  const [template, drills, templates] = await Promise.all([
    getTemplateWithBlocks(supabase, templateId),
    listDrills(supabase, activeTeam.id),
    listTemplates(supabase, activeTeam.id),
  ]);
  if (!template) notFound();
  if (template.teamId !== activeTeam.id) notFound();

  return (
    <div className="p-8">
      <div className="max-w-5xl">
        <Link
          href="/practices/templates"
          className="text-sm text-brand-700 hover:underline"
        >
          ← Back to templates
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-2 mb-6">Edit template</h1>

        <TemplateBuilderForm
          mode="edit"
          teamId={activeTeam.id}
          drills={drills}
          allTemplates={templates}
          template={template}
        />
      </div>
    </div>
  );
}
