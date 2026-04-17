import type { JSX } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { getProfileByHandle } from '@baseball/database';
import type { PlayerProfile } from '@baseball/shared';
import { VideoEmbed } from './VideoEmbed';
import { CareerStats } from '../../(app)/players/me/CareerStats';

interface Params {
  params: { handle: string };
}

/**
 * Loads a profile only if it is public AND the owner has an active Player Pro
 * subscription. We use the service role so the page still works for anonymous
 * visitors, but filter strictly against those two conditions.
 */
async function loadPublicProfile(handle: string) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return null;
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey);

  const bundle = await getProfileByHandle(db, handle);
  if (!bundle) return null;

  const { profile } = bundle;
  if (!profile.isPublic) return null;

  const { data: sub } = await db
    .from('subscriptions')
    .select('id')
    .eq('entity_type', 'player')
    .eq('user_id', profile.userId)
    .in('status', ['active', 'trial'])
    .limit(1)
    .maybeSingle();
  if (!sub) return null;

  // Display name from user_profiles
  const { data: userProfile } = await db
    .from('user_profiles')
    .select('first_name, last_name')
    .eq('id', profile.userId)
    .maybeSingle();

  return {
    ...bundle,
    firstName: userProfile?.first_name ?? '',
    lastName: userProfile?.last_name ?? '',
    db,
  };
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const loaded = await loadPublicProfile(params.handle);
  if (!loaded) {
    return { title: 'Player profile' };
  }
  const { profile, firstName, lastName } = loaded;
  const name = [firstName, lastName].filter(Boolean).join(' ') || profile.handle;
  const title = profile.headline ? `${name} — ${profile.headline}` : `${name} — recruiting profile`;
  const description = profile.bio ?? `Career stats and highlights for ${name}.`;
  const images = profile.profilePhotoUrl ? [{ url: profile.profilePhotoUrl }] : [];
  return {
    title,
    description,
    openGraph: { title, description, images, type: 'profile' },
    twitter: { title, description, card: 'summary_large_image', images: images.map((i) => i.url) },
  };
}

export default async function PublicProfilePage({ params }: Params): Promise<JSX.Element> {
  const loaded = await loadPublicProfile(params.handle);
  if (!loaded) notFound();
  const { profile, highlights, photos, firstName, lastName, db } = loaded;

  const name = [firstName, lastName].filter(Boolean).join(' ') || profile.handle;
  const initials =
    `${firstName.charAt(0) || '?'}${lastName.charAt(0) || ''}`.toUpperCase();

  const galleryUrls = photos.map((p) => ({
    ...p,
    url: db.storage.from('player-media').getPublicUrl(p.storagePath).data.publicUrl,
  }));

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-6 py-8 flex items-center gap-6">
          <div className="w-24 h-24 md:w-28 md:h-28 rounded-full overflow-hidden bg-brand-100 flex items-center justify-center text-brand-700 text-3xl font-bold shrink-0">
            {profile.profilePhotoUrl ? (
              <img
                src={profile.profilePhotoUrl}
                alt={name}
                className="w-full h-full object-cover"
              />
            ) : (
              initials
            )}
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">{name}</h1>
            {profile.headline && (
              <p className="text-base text-gray-600 mt-1">{profile.headline}</p>
            )}
            <p className="text-xs text-gray-400 mt-2">
              Verified recruiting profile · DiamondOS
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-8">
        {profile.bio && (
          <section className="bg-white border border-gray-200 rounded-xl p-6">
            <p className="text-gray-800 whitespace-pre-line text-sm leading-relaxed">
              {profile.bio}
            </p>
          </section>
        )}

        <MeasurablesCard profile={profile} />

        <section className="bg-white border border-gray-200 rounded-xl p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Career stats</h2>
          <CareerStats userId={profile.userId} firstName={firstName || 'Player'} lastName={lastName} />
        </section>

        {highlights.length > 0 && (
          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-4">Highlights</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {highlights.map((h) => (
                <VideoEmbed key={h.id} video={h} />
              ))}
            </div>
          </section>
        )}

        {galleryUrls.length > 0 && (
          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-4">Gallery</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {galleryUrls.map((p) => (
                <a
                  key={p.id}
                  href={p.url}
                  target="_blank"
                  rel="noreferrer"
                  className="relative aspect-square bg-gray-100 rounded-lg overflow-hidden block"
                >
                  <img
                    src={p.url}
                    alt={p.caption ?? ''}
                    className="w-full h-full object-cover hover:scale-105 transition-transform"
                  />
                  {p.caption && (
                    <p className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs px-2 py-1 truncate">
                      {p.caption}
                    </p>
                  )}
                </a>
              ))}
            </div>
          </section>
        )}

        {profile.achievements.length > 0 && (
          <section className="bg-white border border-gray-200 rounded-xl p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-4">Achievements</h2>
            <ul className="space-y-2">
              {profile.achievements.map((a, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-800">
                  <span className="text-brand-700 mt-0.5">▸</span>
                  <span>{a}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>

      <footer className="max-w-4xl mx-auto px-6 py-8 text-center">
        <p className="text-xs text-gray-400">
          Built on{' '}
          <a href="/" className="hover:underline text-gray-500">
            DiamondOS
          </a>
          — player-owned recruiting profiles.
        </p>
      </footer>
    </div>
  );
}

function MeasurablesCard({ profile }: { profile: PlayerProfile }): JSX.Element | null {
  const items: { label: string; value: string }[] = [];

  if (profile.heightInches) {
    const ft = Math.floor(profile.heightInches / 12);
    const inch = profile.heightInches % 12;
    items.push({ label: 'Height', value: `${ft}'${inch}"` });
  }
  if (profile.weightLbs) items.push({ label: 'Weight', value: `${profile.weightLbs} lbs` });
  if (profile.sixtyYardDashSeconds)
    items.push({ label: '60-yd', value: `${profile.sixtyYardDashSeconds.toFixed(2)}s` });
  if (profile.exitVelocityMph)
    items.push({ label: 'Exit velo', value: `${profile.exitVelocityMph} mph` });
  if (profile.pitchVelocityMph)
    items.push({ label: 'Pitch velo', value: `${profile.pitchVelocityMph} mph` });
  if (profile.popTimeSeconds)
    items.push({ label: 'Pop time', value: `${profile.popTimeSeconds.toFixed(2)}s` });
  if (profile.gpa) items.push({ label: 'GPA', value: profile.gpa.toFixed(2) });
  if (profile.satScore) items.push({ label: 'SAT', value: profile.satScore.toString() });
  if (profile.actScore) items.push({ label: 'ACT', value: profile.actScore.toString() });

  if (items.length === 0) return null;

  return (
    <section className="bg-white border border-gray-200 rounded-xl p-6">
      <h2 className="text-base font-semibold text-gray-900 mb-4">Measurables</h2>
      <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
        {items.map(({ label, value }) => (
          <div key={label} className="bg-gray-50 border border-gray-100 rounded-lg px-3 py-3 text-center">
            <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-0.5">{label}</p>
            <p className="text-base font-bold text-gray-900 tabular-nums">{value}</p>
          </div>
        ))}
      </div>
      {profile.targetMajors.length > 0 && (
        <div className="mt-5 pt-5 border-t border-gray-100">
          <p className="text-xs uppercase tracking-wide text-gray-500 font-semibold mb-2">
            Target majors
          </p>
          <div className="flex flex-wrap gap-2">
            {profile.targetMajors.map((m, i) => (
              <span
                key={i}
                className="text-xs bg-brand-50 text-brand-700 border border-brand-200 px-2.5 py-1 rounded-full"
              >
                {m}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
