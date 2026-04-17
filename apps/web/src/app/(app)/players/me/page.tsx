import type { JSX } from 'react';
import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { listHighlights, listPhotos } from '@baseball/database';
import { getPlayerPro, PLAYER_MEDIA_BUCKET } from '@/lib/player-pro';
import { ProfileEditor } from './ProfileEditor';
import { PhotoUpload } from './PhotoUpload';
import { PublishToggle } from './PublishToggle';
import { HighlightsManager } from './HighlightsManager';
import { GalleryManager } from './GalleryManager';
import { CareerStats } from './CareerStats';

export const metadata: Metadata = { title: 'My Profile' };

export default async function PlayerMePage(): Promise<JSX.Element> {
  // Authenticated SSR client — every read on this page is the owner's own
  // data (filtered by user.id), so RLS on player_profiles/player_highlight_videos/
  // player_profile_photos enforces access. getPlayerPro still uses the service
  // role internally because subscriptions is platform-admin-gated RLS.
  const db = createServerClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect('/login');

  const [{ isPro, profile }, userProfileRes] = await Promise.all([
    getPlayerPro(user.id),
    db
      .from('user_profiles')
      .select('first_name, last_name, email')
      .eq('id', user.id)
      .maybeSingle(),
  ]);
  const userProfile = userProfileRes.data;

  // If no player_profiles row exists yet, redirect to setup
  if (!profile) {
    return <OnboardingPrompt email={userProfile?.email ?? user.email ?? ''} />;
  }

  const [highlights, photos] = await Promise.all([
    listHighlights(db, user.id),
    listPhotos(db, user.id),
  ]);

  const firstName = userProfile?.first_name ?? 'Player';
  const lastName = userProfile?.last_name ?? '';
  const initials = `${firstName.charAt(0) || '?'}${lastName.charAt(0) || ''}`.toUpperCase();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? '';
  const publicUrl = profile.handle && appUrl ? `${appUrl}/p/${profile.handle}` : null;

  const getPublicPhotoUrl = (path: string) =>
    db.storage.from(PLAYER_MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-6">
      <header className="flex items-start justify-between gap-4 mb-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Your recruiting profile</h1>
          <p className="text-sm text-gray-500 mt-1">
            Everything a college coach needs — measurables, stats, video, all in one link.
          </p>
        </div>
        <span
          className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full ${
            isPro
              ? 'bg-amber-50 text-amber-800 border border-amber-200'
              : 'bg-gray-50 text-gray-600 border border-gray-200'
          }`}
        >
          {isPro ? 'Pro · Active' : 'Free'}
        </span>
      </header>

      <PublishToggle
        isPublic={profile.isPublic}
        isPro={isPro}
        handle={profile.handle}
        publicUrl={publicUrl}
      />

      <PhotoUpload currentUrl={profile.profilePhotoUrl} isPro={isPro} initials={initials} />

      <ProfileEditor profile={profile} />

      <HighlightsManager highlights={highlights} isPro={isPro} />

      <GalleryManager photos={photos} isPro={isPro} publicUrlForPath={getPublicPhotoUrl} />

      <section className="bg-white border border-gray-200 rounded-xl p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Career stats</h2>
        <p className="text-xs text-gray-500 mb-5">
          Aggregated across every team you&apos;re on. Stats automatically appear when coaches score games.
        </p>
        <CareerStats userId={user.id} firstName={firstName} lastName={lastName} />
      </section>
    </div>
  );
}

function OnboardingPrompt({ email }: { email: string }): JSX.Element {
  return (
    <div className="p-8 max-w-xl mx-auto">
      <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
        <h1 className="text-xl font-bold text-gray-900 mb-2">Finishing up your profile…</h1>
        <p className="text-sm text-gray-500 mb-4">
          We couldn&apos;t find a player profile for <strong>{email}</strong>. If you just signed up, please
          refresh this page — provisioning can take a moment after first login.
        </p>
        <a href="/players/me" className="text-sm text-brand-700 hover:underline">
          Refresh
        </a>
      </div>
    </div>
  );
}
