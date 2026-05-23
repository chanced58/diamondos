import type { JSX } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { TRAINING_MODULES, nextIncompleteSlug } from '@baseball/shared';
import { createServerClient } from '@/lib/supabase/server';
import { getTrainingProgress } from '@/lib/training/get-progress';
import { ProgressList } from '@/components/training/ProgressList';
import { CertifiedBadge } from '@/components/training/CertifiedBadge';
import { Card } from '@/components/ui/Card';

export const metadata: Metadata = { title: 'Training' };

export default async function TrainingPage(): Promise<JSX.Element> {
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const progress = await getTrainingProgress(user.id);
  const next = nextIncompleteSlug(progress.completedSlugs);
  const totalMin = TRAINING_MODULES.reduce((sum, m) => sum + m.estimatedMinutes, 0);
  const doneCount = progress.completedSlugs.filter((s) =>
    TRAINING_MODULES.some((m) => m.slug === s),
  ).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0 }}>Training</h1>
        {progress.isCertified && <CertifiedBadge size="md" />}
      </header>

      <p style={{ margin: 0, opacity: 0.75, maxWidth: 720 }}>
        Five short modules that walk you through how to use DiamondOS — navigation, rosters,
        scoring, pitch-count compliance, and messaging. Complete every module&apos;s quiz to earn
        the Certified badge. Total time: ~{totalMin} minutes.
      </p>

      <Card>
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 14, opacity: 0.7 }}>Your progress</div>
              <div style={{ fontSize: 20, fontWeight: 600 }}>
                {doneCount} / {TRAINING_MODULES.length} modules
              </div>
            </div>
            {next ? (
              <Link
                href={`/training/${next}`}
                className="btn btn-primary"
                style={{ textDecoration: 'none', padding: '10px 16px', borderRadius: 8 }}
              >
                {doneCount === 0 ? 'Start training' : 'Resume'}
              </Link>
            ) : (
              <span className="badge badge-safe">All modules complete</span>
            )}
          </div>

          <ProgressList modules={TRAINING_MODULES} completedSlugs={progress.completedSlugs} />
        </div>
      </Card>
    </div>
  );
}
