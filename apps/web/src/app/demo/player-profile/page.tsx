import type { JSX } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { DEMO_PLAYER } from './mock-data';
import { ProfileHero } from './sections/ProfileHero';
import { MeasurablesCard } from './sections/MeasurablesCard';
import { CareerStats } from './sections/CareerStats';
import { StrengthsSummary } from './sections/StrengthsSummary';
import { CharacterCard } from './sections/CharacterCard';
import { AcademicsCard } from './sections/AcademicsCard';
import { MediaPlaceholder } from './sections/MediaPlaceholder';
import { RecruitingFacts } from './sections/RecruitingFacts';

export const metadata: Metadata = {
  title: 'Player profile preview — DiamondOS',
  description:
    'See what a DiamondOS player profile looks like for college recruiters and pro scouts: lifetime stats, measurables, character highlights, and AI-powered scouting summary.',
};

export default function PlayerProfileDemoPage(): JSX.Element {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-amber-50 border-b border-amber-200">
        <div className="max-w-4xl mx-auto px-6 py-2.5 text-xs sm:text-sm text-amber-900">
          <span className="font-semibold">Preview</span> · Sample player. Real profiles pull live stats, coach entries, and uploaded media.
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 pt-4">
        <Link href="/" className="text-xs text-gray-500 hover:text-gray-700 inline-flex items-center gap-1">
          ← Back to home
        </Link>
      </div>

      <ProfileHero player={DEMO_PLAYER} />

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-8">
        <MeasurablesCard player={DEMO_PLAYER} />
        <CareerStats player={DEMO_PLAYER} />
        <StrengthsSummary player={DEMO_PLAYER} />
        <CharacterCard player={DEMO_PLAYER} />
        <AcademicsCard player={DEMO_PLAYER} />
        <MediaPlaceholder />
        <RecruitingFacts player={DEMO_PLAYER} />
      </main>

      <footer className="max-w-4xl mx-auto px-6 py-8 text-center">
        <p className="text-xs text-gray-400">
          Built on{' '}
          <Link href="/" className="hover:underline text-gray-500">
            DiamondOS
          </Link>{' '}
          — player-owned recruiting profiles.
        </p>
      </footer>
    </div>
  );
}
