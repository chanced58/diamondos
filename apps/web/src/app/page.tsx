import type { JSX, ReactNode } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { createServerClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { ScoringDemo } from '@/components/home/ScoringDemo';
import { LeadCaptureForm } from '@/components/home/LeadCaptureForm';
import { HashRedirect } from '@/components/auth/HashRedirect';
import { BrandMark } from '@/components/ui/BrandMark';
import { DiamondField } from '@/components/ui/DiamondField';

export const metadata: Metadata = {
  title: 'DiamondOS — Coach like you mean it',
  description:
    'Pitch-by-pitch scorekeeping, real-time stats, team communication, and pitch count compliance for baseball coaches.',
};

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
  hero_headline: 'Coach like you *mean* it.',
  hero_subtext:
    'Scorekeeping, pitch-count compliance, team communication, and statistics — built for the dugout, not the desk.',
  cta_button_text: 'Let us know',
  form_headline: 'Still *building*',
  form_subtext: 'If you are interested, please let us know.',
};

// Render a string with `*word*` markers as italic-turf emphasis.
// Lets tenants customize hero/form headlines from site_settings while keeping
// the editorial italic accent in place.
function renderEmphasized(text: string): ReactNode[] {
  return text.split(/(\*[^*]+\*)/g).map((part, i) => {
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return (
        <em key={`${i}:${part}`} className="display-it" style={{ color: 'var(--turf-700)' }}>
          {part.slice(1, -1)}
        </em>
      );
    }
    return part;
  });
}

const VALUE_PROPS = [
  {
    eyebrow: 'Scorekeeping',
    title: 'Pitch by pitch, in the sun',
    body: 'Record every ball, hit, and out in real time. Works offline — syncs automatically when you reconnect.',
  },
  {
    eyebrow: 'Communication',
    title: 'Team in one tap',
    body: 'Announcements, topic channels, direct messages. Push notifications and RSVPs. No more group texts.',
  },
  {
    eyebrow: 'Stats',
    title: 'Numbers that follow the player',
    body: 'Every at-bat is tied to the player profile — moves with them team to team. Spray charts, QABs, ERAs, all computed from play-by-play.',
  },
];

export default async function HomePage(): Promise<JSX.Element> {
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  const isLoggedIn = !!user;

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
    <div style={{ minHeight: '100vh', background: 'var(--app-bg)', display: 'flex', flexDirection: 'column' }}>
      <HashRedirect />

      {/* Sticky nav */}
      <nav
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          background: 'rgba(255,255,255,.85)',
          backdropFilter: 'saturate(1.2) blur(10px)',
          borderBottom: '1px solid var(--app-border)',
        }}
      >
        <div
          style={{
            maxWidth: 1100,
            margin: '0 auto',
            padding: '14px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: 'var(--app-fg)' }}>
            {s.logo_url ? (
              <img src={s.logo_url} alt={s.site_name} style={{ height: 32, width: 32, objectFit: 'contain' }} />
            ) : (
              <BrandMark size={32} />
            )}
            <span className="display" style={{ fontSize: 20, letterSpacing: '-0.01em' }}>{s.site_name}</span>
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Link href={isLoggedIn ? '/dashboard' : '/login'} className="btn btn-ghost btn-sm">
              {isLoggedIn ? 'Dashboard' : 'Sign in'}
            </Link>
            {!isLoggedIn && (
              <Link href="/players/signup" className="btn btn-turf btn-sm">Start free</Link>
            )}
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section style={{ padding: '80px 24px 48px', position: 'relative' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', textAlign: 'center' }}>
          <div className="eyebrow" style={{ color: 'var(--turf-700)', marginBottom: 14 }}>
            Built for dugouts · Not desks
          </div>
          <h1
            className="display"
            style={{
              fontSize: 'clamp(44px, 7vw, 88px)',
              letterSpacing: '-0.02em',
              lineHeight: 1,
              margin: 0,
            }}
          >
            {renderEmphasized(s.hero_headline)}
          </h1>
          <p
            style={{
              fontSize: 18,
              color: 'var(--app-fg-muted)',
              lineHeight: 1.55,
              maxWidth: 640,
              margin: '22px auto 0',
            }}
          >
            {s.hero_subtext}
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 28, flexWrap: 'wrap' }}>
            <Link href={isLoggedIn ? '/dashboard' : '/players/signup'} className="btn btn-turf btn-lg">
              {isLoggedIn ? 'Open dashboard' : 'Start free'}
            </Link>
            <Link href="/demo/player-profile" className="btn btn-ghost btn-lg">
              See a sample profile
            </Link>
          </div>
        </div>
      </section>

      {/* Product mock — scoreboard + floating field */}
      <section style={{ padding: '0 24px 80px' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto', position: 'relative' }}>
          <div
            className="card card-hero"
            style={{
              padding: 32,
              borderRadius: 20,
              boxShadow: '0 30px 60px -30px rgba(0,0,0,.3)',
            }}
          >
            <div className="between" style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: 20 }}>
              <div>
                <div className="eyebrow" style={{ color: 'var(--turf-200)' }}>
                  <span className="live-chip" style={{ marginRight: 8 }}>
                    <span className="pulse" />
                    Live
                  </span>
                  Top of 4
                </div>
                <div className="display" style={{ fontSize: 'clamp(32px, 5vw, 48px)', color: 'white', marginTop: 10 }}>
                  Wildcats{' '}
                  <span style={{ opacity: 0.55, fontFamily: 'var(--font-sans)', fontWeight: 500, fontSize: 24 }}>vs</span>{' '}
                  Hawks
                </div>
                <div style={{ color: 'rgba(255,255,255,.7)', marginTop: 6, fontSize: 13 }}>
                  Ridgeview HS · Field 2 · Sat 3:30 PM
                </div>
              </div>
              <div style={{ display: 'flex', gap: 28, alignItems: 'center' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,.6)', letterSpacing: '.1em', textTransform: 'uppercase' }}>
                    Away
                  </div>
                  <div
                    className="mono"
                    style={{ fontSize: 'clamp(44px, 7vw, 64px)', fontWeight: 800, lineHeight: 1, color: 'white', fontFamily: 'var(--font-display)' }}
                  >
                    4
                  </div>
                </div>
                <div style={{ color: 'rgba(255,255,255,.3)', fontSize: 24, fontFamily: 'var(--font-display)', fontStyle: 'italic' }}>
                  vs
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,.6)', letterSpacing: '.1em', textTransform: 'uppercase' }}>
                    Home
                  </div>
                  <div
                    className="mono"
                    style={{ fontSize: 'clamp(44px, 7vw, 64px)', fontWeight: 800, lineHeight: 1, color: 'white', fontFamily: 'var(--font-display)' }}
                  >
                    2
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div
            style={{
              position: 'absolute',
              right: -10,
              top: -24,
              display: 'grid',
              placeItems: 'center',
              pointerEvents: 'none',
            }}
            className="hidden md:grid"
          >
            <DiamondField runners={{ first: true, second: true, third: false }} size={140} variant="editorial" />
          </div>
        </div>
      </section>

      {/* Value props */}
      <section style={{ padding: '0 24px 80px' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20 }}>
            {VALUE_PROPS.map((p) => (
              <div
                key={p.title}
                className="card"
                style={{
                  padding: 24,
                  borderLeft: '3px solid var(--turf-600)',
                  borderRadius: 12,
                }}
              >
                <div className="eyebrow" style={{ color: 'var(--turf-700)' }}>{p.eyebrow}</div>
                <div className="display" style={{ fontSize: 22, marginTop: 6 }}>{p.title}</div>
                <p style={{ fontSize: 14, color: 'var(--app-fg-muted)', lineHeight: 1.55, marginTop: 8, marginBottom: 0 }}>
                  {p.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Scoring demo */}
      <section style={{ padding: '0 24px 80px' }}>
        <div style={{ maxWidth: 560, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 18 }}>
            <div className="eyebrow" style={{ color: 'var(--turf-700)' }}>Try it</div>
            <div className="display" style={{ fontSize: 28, marginTop: 6 }}>Score an at-bat</div>
            <p style={{ fontSize: 14, color: 'var(--app-fg-muted)', marginTop: 4 }}>
              Record pitches and outcomes for 3 batters using the real {s.site_name} game engine.
            </p>
          </div>
          <div className="card" style={{ padding: 28 }}>
            <ScoringDemo isLoggedIn={isLoggedIn} />
          </div>
        </div>
      </section>

      {/* Quote band */}
      <section
        style={{
          padding: '64px 24px',
          background: 'var(--brand-900)',
          color: 'white',
        }}
      >
        <div style={{ maxWidth: 800, margin: '0 auto', textAlign: 'center' }}>
          <p
            className="display-it"
            style={{
              fontSize: 'clamp(24px, 3.5vw, 40px)',
              lineHeight: 1.25,
              color: 'white',
              margin: 0,
            }}
          >
            &ldquo;Numbers that follow the player, not the team.
            Every at-bat, every pitch, every play — portable across every team a player joins.&rdquo;
          </p>
          <div style={{ marginTop: 18, color: 'var(--turf-200)', fontSize: 13, letterSpacing: 0.14, textTransform: 'uppercase', fontWeight: 700 }}>
            The DiamondOS promise
          </div>
        </div>
      </section>

      {/* Footer CTA / Lead capture */}
      {!isLoggedIn && (
        <section style={{ padding: '64px 24px', background: 'var(--app-surface)' }}>
          <div style={{ maxWidth: 460, margin: '0 auto', textAlign: 'center' }}>
            <div className="display" style={{ fontSize: 32 }}>
              {renderEmphasized(s.form_headline)}
            </div>
            <p style={{ fontSize: 14, color: 'var(--app-fg-muted)', marginTop: 8, marginBottom: 18 }}>
              {s.form_subtext}
            </p>
            <LeadCaptureForm
              ctaText={s.cta_button_text}
              primaryColor={s.primary_color}
              secondaryColor={s.secondary_color}
              siteName={s.site_name}
            />
          </div>
        </section>
      )}

      {/* Footer */}
      <footer style={{ marginTop: 'auto', borderTop: '1px solid var(--app-border)', background: 'var(--app-surface)' }}>
        <div
          style={{
            maxWidth: 1100,
            margin: '0 auto',
            padding: '20px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: 12,
            color: 'var(--app-fg-subtle)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <BrandMark size={20} />
            <span>{s.site_name}</span>
          </div>
          <span>&copy; {new Date().getFullYear()}</span>
        </div>
      </footer>
    </div>
  );
}
