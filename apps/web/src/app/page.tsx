import type { JSX } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { createServerClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { ScoringDemo } from '@/components/home/ScoringDemo';
import { LeadCaptureForm } from '@/components/home/LeadCaptureForm';

export const metadata: Metadata = {
  title: 'DiamondOS — Baseball Coaching Platform',
  description:
    'Pitch-by-pitch scorekeeping, real-time stats, team communication, and pitch count compliance for baseball coaches.',
};

// ── Site settings type ──────────────────────────────────────────────────────

interface SiteSettings {
  logo_url: string | null;
  site_name: string;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  hero_headline: string;
  hero_subtext: string;
  cta_button_text: string;
  form_headline: string;
  form_subtext: string;
}

const DEFAULTS: SiteSettings = {
  logo_url: null,
  site_name: 'DiamondOS',
  primary_color: '#1e3a8a',
  secondary_color: '#1d4ed8',
  accent_color: '#eff6ff',
  hero_headline: 'The Operating System for Baseball Coaches',
  hero_subtext: 'Scorekeeping, pitch count compliance, team communication, and statistics — all in one platform built for high school and youth baseball.',
  cta_button_text: 'Get Early Access',
  form_headline: 'We\'re still building',
  form_subtext: 'Tell us about your program and we\'ll reach out when we go live.',
};

// ── Feature data ────────────────────────────────────────────────────────────

const FEATURES = [
  {
    title: 'Pitch-by-Pitch Scoring',
    description:
      'Record every pitch, hit, and play in real time. Works offline — syncs automatically when you reconnect.',
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" />
      </svg>
    ),
  },
  {
    title: 'Pitch Count Compliance',
    description:
      'Built-in NFHS, Little League, and NCAA pitch count rules. Automatic rest-day calculations and live alerts.',
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
      </svg>
    ),
  },
  {
    title: 'Team Communication',
    description:
      'Announcements, topic channels, and direct messages with push notifications and RSVP tracking.',
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 0 1-.825-.242m9.345-8.334a2.126 2.126 0 0 0-.476-.095 48.64 48.64 0 0 0-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0 0 11.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
      </svg>
    ),
  },
  {
    title: 'Statistics & Analytics',
    description:
      'Batting averages, ERA, Quality At-Bats, and spray charts — all computed from your play-by-play data.',
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
      </svg>
    ),
  },
];

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function HomePage(): Promise<JSX.Element> {
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  const isLoggedIn = !!user;

  // Fetch site settings (public read)
  let s: SiteSettings = DEFAULTS;
  try {
    const db = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    const { data } = await db
      .from('site_settings')
      .select('logo_url, site_name, primary_color, secondary_color, accent_color, hero_headline, hero_subtext, cta_button_text, form_headline, form_subtext')
      .eq('id', 'default')
      .single();
    if (data) s = data as SiteSettings;
  } catch {
    // Fall back to defaults
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* ── Nav ─────────────────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2.5">
            {s.logo_url ? (
              <img src={s.logo_url} alt={s.site_name} className="h-8 w-8 object-contain" />
            ) : (
              <span
                className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm"
                style={{ backgroundColor: s.primary_color }}
              >
                {s.site_name.charAt(0)}
              </span>
            )}
            <span className="text-xl font-bold tracking-tight" style={{ color: s.primary_color }}>
              {s.site_name}
            </span>
          </a>
          <Link
            href={isLoggedIn ? '/dashboard' : '/login'}
            className="text-sm font-medium px-4 py-2 rounded-lg text-white transition-colors"
            style={{ backgroundColor: s.primary_color }}
          >
            {isLoggedIn ? 'Go to Dashboard' : 'Sign In'}
          </Link>
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────────────────────────────── */}
      <section className="pt-20 pb-12 px-6" style={{ backgroundColor: s.accent_color }}>
        <div className="max-w-3xl mx-auto text-center space-y-5">
          {s.logo_url && (
            <img src={s.logo_url} alt={s.site_name} className="h-16 w-16 object-contain mx-auto" />
          )}
          <h1 className="text-4xl sm:text-5xl font-extrabold text-gray-900 tracking-tight leading-tight">
            {s.hero_headline}
          </h1>
          <p className="text-lg text-gray-500 max-w-2xl mx-auto leading-relaxed">
            {s.hero_subtext}
          </p>
          {isLoggedIn && (
            <div className="pt-2">
              <Link
                href="/dashboard"
                className="inline-block px-6 py-3 text-sm font-semibold rounded-lg text-white transition-colors shadow-sm"
                style={{ backgroundColor: s.primary_color }}
              >
                Open Dashboard
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* ── Features ────────────────────────────────────────────────────────── */}
      <section className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-2xl font-bold text-gray-900">
              Everything You Need on Game Day
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="bg-white rounded-xl border border-gray-200 p-6 space-y-3"
              >
                <div style={{ color: s.secondary_color }}>{f.icon}</div>
                <h3 className="font-semibold text-gray-900">{f.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Scoring Demo ────────────────────────────────────────────────────── */}
      <section className="pb-16 px-6 pt-16">
        <div className="max-w-xl mx-auto">
          <div className="text-center mb-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: s.secondary_color }}>
              Try It
            </h2>
            <p className="mt-1 text-2xl font-bold text-gray-900">Score an At-Bat</p>
            <p className="mt-1 text-sm text-gray-400">
              Record pitches and outcomes for 3 batters using the real {s.site_name} game engine.
            </p>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 sm:p-8">
            <ScoringDemo isLoggedIn={isLoggedIn} />
          </div>
        </div>
      </section>

      {/* ── Portable Stats ────────────────────────────────────────────────── */}
      <section className="py-20 px-6" style={{ backgroundColor: s.accent_color }}>
        <div className="max-w-3xl mx-auto text-center space-y-6">
          <div
            className="inline-flex items-center justify-center w-14 h-14 rounded-full"
            style={{ backgroundColor: s.primary_color + '15', color: s.primary_color }}
          >
            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
            </svg>
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">
            Stats that follow the player, not the team
          </h2>
          <p className="text-lg text-gray-500 max-w-2xl mx-auto leading-relaxed">
            Every at-bat, pitch, and play is tied to the player&apos;s profile — not a single team roster.
            When a player moves to a new team on the platform, their full statistical history comes with them.
            Coaches see the complete picture from day one.
          </p>
          <div className="grid sm:grid-cols-3 gap-4 max-w-xl mx-auto pt-2">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="text-2xl font-bold" style={{ color: s.primary_color }}>100%</div>
              <div className="text-sm text-gray-500 mt-1">Portable stats</div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="text-2xl font-bold" style={{ color: s.primary_color }}>Every</div>
              <div className="text-sm text-gray-500 mt-1">Season preserved</div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="text-2xl font-bold" style={{ color: s.primary_color }}>Zero</div>
              <div className="text-sm text-gray-500 mt-1">Data lost on transfer</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA / Lead Capture ────────────────────────────────────────────── */}
      {!isLoggedIn && (
        <section className="py-16 px-6 bg-white">
          <div className="max-w-sm mx-auto text-center">
            <h2 className="text-xl font-bold text-gray-900 mb-1">{s.form_headline}</h2>
            <p className="text-sm text-gray-500 mb-5">{s.form_subtext}</p>
            <LeadCaptureForm
              ctaText={s.cta_button_text}
              primaryColor={s.primary_color}
              secondaryColor={s.secondary_color}
              siteName={s.site_name}
            />
          </div>
        </section>
      )}

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <footer className="mt-auto border-t border-gray-200 bg-white">
        <div className="max-w-5xl mx-auto px-6 py-6 flex items-center justify-between text-xs text-gray-400">
          <div className="flex items-center gap-2">
            {s.logo_url && (
              <img src={s.logo_url} alt="" className="h-5 w-5 object-contain opacity-50" />
            )}
            <span>{s.site_name}</span>
          </div>
          <span>&copy; {new Date().getFullYear()}</span>
        </div>
      </footer>
    </div>
  );
}
