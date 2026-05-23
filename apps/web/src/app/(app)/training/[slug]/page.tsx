import type { JSX } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { TRAINING_MODULES, getModuleBySlug } from '@baseball/shared';
import { createServerClient } from '@/lib/supabase/server';
import { getTrainingProgress } from '@/lib/training/get-progress';
import { Card } from '@/components/ui/Card';
import { ModuleContent } from '@/components/training/ModuleContent';
import { ModuleQuiz } from '@/components/training/ModuleQuiz';
import { ProgressList } from '@/components/training/ProgressList';
import { recordModuleCompletion } from './actions';

interface PageProps {
  params: { slug: string };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const m = getModuleBySlug(params.slug);
  return { title: m ? `${m.title} · Training` : 'Training' };
}

export default async function TrainingModulePage({ params }: PageProps): Promise<JSX.Element> {
  const module_ = getModuleBySlug(params.slug);
  if (!module_) notFound();

  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const progress = await getTrainingProgress(user.id);
  const alreadyDone = progress.completedSlugs.includes(module_.slug);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 260px) minmax(0, 1fr)', gap: 24, alignItems: 'flex-start' }}>
      <aside style={{ position: 'sticky', top: 24 }}>
        <Card>
          <div style={{ padding: 14 }}>
            <Link
              href="/training"
              style={{ fontSize: 13, opacity: 0.7, textDecoration: 'none' }}
            >
              ← All modules
            </Link>
            <div style={{ marginTop: 10 }}>
              <ProgressList
                modules={TRAINING_MODULES}
                completedSlugs={progress.completedSlugs}
                activeSlug={module_.slug}
              />
            </div>
          </div>
        </Card>
      </aside>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <header style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 13, opacity: 0.65 }}>
            {module_.estimatedMinutes} min · {module_.quiz.length} questions
          </span>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700 }}>{module_.title}</h1>
          <p style={{ margin: 0, opacity: 0.75 }}>{module_.summary}</p>
          {alreadyDone && (
            <span className="badge badge-safe" style={{ alignSelf: 'flex-start', marginTop: 6 }}>
              ✓ Already completed
            </span>
          )}
        </header>

        <Card>
          <div style={{ padding: 18 }}>
            <ModuleContent sections={module_.sections} />
          </div>
        </Card>

        <Card>
          <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Quiz</h2>
            <p style={{ margin: 0, opacity: 0.75 }}>
              Answer every question correctly to complete the module. Unlimited retries.
            </p>
            <ModuleQuiz
              slug={module_.slug}
              quiz={module_.quiz}
              submitAction={recordModuleCompletion}
            />
          </div>
        </Card>
      </div>
    </div>
  );
}
