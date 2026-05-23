import type { JSX } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { BrandMark } from '@/components/ui/BrandMark';

export const metadata: Metadata = {
  title: 'About Chance Douglass — DiamondOS',
  description:
    'Former Houston Astros minor-league pitcher (2002–2008), now working in software and IT.',
};

const LINKEDIN_URL = 'https://www.linkedin.com/in/chance-douglass';

export default async function AboutPage(): Promise<JSX.Element> {
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect('/dashboard');

  return (
    <div style={{ minHeight: '100vh', background: 'var(--app-bg)', display: 'flex', flexDirection: 'column' }}>
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
          <Link
            href="/"
            style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: 'var(--app-fg)' }}
          >
            <BrandMark size={32} />
            <span className="display" style={{ fontSize: 20, letterSpacing: '-0.01em' }}>DiamondOS</span>
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Link href="/" className="btn btn-ghost btn-sm">Home</Link>
            <Link href="/login" className="btn btn-ghost btn-sm">Sign in</Link>
          </div>
        </div>
      </nav>

      <section style={{ padding: '64px 24px 32px' }}>
        <div style={{ maxWidth: 760, margin: '0 auto', textAlign: 'center' }}>
          <div className="eyebrow" style={{ color: 'var(--turf-700)', marginBottom: 14 }}>
            About
          </div>
          <h1
            className="display"
            style={{
              fontSize: 'clamp(40px, 6vw, 72px)',
              letterSpacing: '-0.02em',
              lineHeight: 1.05,
              margin: 0,
            }}
          >
            Chance <em className="display-it" style={{ color: 'var(--turf-700)' }}>Douglass</em>
          </h1>
          <p
            style={{
              fontSize: 18,
              color: 'var(--app-fg-muted)',
              lineHeight: 1.55,
              maxWidth: 560,
              margin: '20px auto 0',
            }}
          >
            Former Houston Astros minor-league pitcher. Now building software.
          </p>
        </div>
      </section>

      <section style={{ padding: '0 24px 32px' }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <div
            className="card"
            style={{
              padding: 28,
              borderLeft: '3px solid var(--turf-600)',
              borderRadius: 12,
            }}
          >
            <div className="eyebrow" style={{ color: 'var(--turf-700)' }}>
              Baseball · 2002–2008
            </div>
            <div className="display" style={{ fontSize: 26, marginTop: 6 }}>
              Houston Astros organization
            </div>
            <p
              style={{
                fontSize: 15,
                color: 'var(--app-fg-muted)',
                lineHeight: 1.6,
                marginTop: 12,
                marginBottom: 0,
              }}
            >
              Drafted by the Houston Astros in the 12th round of the 2002 MLB Draft out of
              Canyon Randall HS in Amarillo, Texas. Right-handed pitcher in the Astros minor-league
              system from 2002 through 2008 — including a 2005 Salem MVP season and a Texas
              League Pitcher of the Week honor with the Corpus Christi Hooks.
            </p>
          </div>
        </div>
      </section>

      <section style={{ padding: '0 24px 80px' }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <div
            className="card"
            style={{
              padding: 28,
              borderLeft: '3px solid var(--brand-600, #1d4ed8)',
              borderRadius: 12,
            }}
          >
            <div className="eyebrow" style={{ color: 'var(--turf-700)' }}>
              Software &amp; IT
            </div>
            <div className="display" style={{ fontSize: 26, marginTop: 6 }}>
              After baseball
            </div>
            <p
              style={{
                fontSize: 15,
                color: 'var(--app-fg-muted)',
                lineHeight: 1.6,
                marginTop: 12,
                marginBottom: 20,
              }}
            >
              After baseball I moved into software and IT. My full work history — roles,
              companies, and skills — lives on LinkedIn.
            </p>
            <a
              href={LINKEDIN_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-turf btn-lg"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
            >
              View LinkedIn Profile
              <span aria-hidden="true" style={{ fontSize: 14 }}>↗</span>
            </a>
          </div>
        </div>
      </section>

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
            <span>DiamondOS</span>
          </div>
          <span>&copy; {new Date().getFullYear()}</span>
        </div>
      </footer>
    </div>
  );
}
