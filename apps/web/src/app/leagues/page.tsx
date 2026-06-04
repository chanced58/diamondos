import type { JSX } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { createServerClient } from '@/lib/supabase/server';
import { BrandMark } from '@/components/ui/BrandMark';
import { listPublicLeagues } from '@/lib/league-home/load';
import { LeagueDirectory } from './_components/LeagueDirectory';

export const metadata: Metadata = {
  title: 'Leagues — DiamondOS',
  description: 'Browse public baseball leagues on DiamondOS — standings, stats, and highlights for every league.',
};

/**
 * Public `/leagues` directory page. Fetches all publicly visible leagues
 * server-side and renders them (or an empty state) inside a nav/footer shell
 * mirroring the marketing home page. Reachable without authentication.
 */
export default async function LeaguesPage(): Promise<JSX.Element> {
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  const isLoggedIn = !!user;

  const leagues = await listPublicLeagues();

  return (
    <div style={{ minHeight: '100vh', background: 'var(--app-bg)', display: 'flex', flexDirection: 'column' }}>
      {/* Sticky nav — mirrors the marketing home page shell */}
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
            <BrandMark size={32} />
            <span className="display" style={{ fontSize: 20, letterSpacing: '-0.01em' }}>DiamondOS</span>
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

      <main style={{ flex: 1, width: '100%', maxWidth: 1100, margin: '0 auto', padding: '48px 24px 64px' }}>
        <header className="mb-8">
          <div className="eyebrow" style={{ color: 'var(--turf-700)', marginBottom: 10 }}>
            Public leagues
          </div>
          <h1 className="display" style={{ fontSize: 'clamp(32px, 5vw, 52px)', letterSpacing: '-0.02em', lineHeight: 1.05, margin: 0 }}>
            Browse leagues
          </h1>
          <p className="mt-3 text-app-fg-muted" style={{ maxWidth: 560 }}>
            Standings, leaders, and highlights — updated as games are scored. Pick a league to open its home page.
          </p>
        </header>

        {leagues.length === 0 ? (
          <p className="rounded-xl border border-app-border bg-app-surface px-4 py-12 text-center text-sm text-app-fg-subtle">
            No public leagues yet. Check back soon.
          </p>
        ) : (
          <LeagueDirectory leagues={leagues} />
        )}
      </main>

      {/* Footer — mirrors the marketing home page */}
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
