'use client';
import type { JSX } from 'react';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createBrowserClient } from '@/lib/supabase/client';
import { SubscriptionTier, hasFeature, Feature } from '@baseball/shared';

const SIDEBAR_KEY = 'sidebar-collapsed';

interface SidebarProps {
  teamName?: string;
  teamOrg?: string;
  teamId?: string;
  logoUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  isPlatformAdmin?: boolean;
  leagueId?: string;
  leagueName?: string;
  subscriptionTier?: SubscriptionTier;
  hasPlayerProfile?: boolean;
}

export function Sidebar({ teamName, teamOrg, teamId, logoUrl, primaryColor, secondaryColor, isPlatformAdmin, leagueId, leagueName, subscriptionTier = SubscriptionTier.FREE, hasPlayerProfile }: SidebarProps): JSX.Element | null {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(SIDEBAR_KEY);
    if (saved === 'true') setCollapsed(true);
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(SIDEBAR_KEY, String(next));
      return next;
    });
  }

  // Platform admin on /admin routes = neutral mode (no team branding)
  const isAdminPanel = isPlatformAdmin && pathname.startsWith('/admin');

  const bg     = isAdminPanel ? '#1f2937' : (primaryColor   ?? '#1e2d6b');
  const active = isAdminPanel ? '#374151' : (secondaryColor ?? '#1e3a8a');

  const canPractices = hasFeature(subscriptionTier, Feature.PRACTICE_PLANNING);
  const canLeague = hasFeature(subscriptionTier, Feature.LEAGUE_MANAGEMENT);

  const teamNavItems = [
    { href: '/dashboard',                                  label: 'Dashboard',       icon: '⚾' },
    { href: '/games',                                      label: 'Schedule',        icon: '📋' },
    ...(canPractices ? [{ href: '/practices',              label: 'Practices',       icon: '🏋️' }] : []),
    { href: '/compliance',                                 label: 'Stats',           icon: '📊' },
    { href: '/messages',                                   label: 'Messages',        icon: '💬' },
    { href: teamId ? `/teams/${teamId}/admin` : '/teams',  label: 'Team Management', icon: '👥' },
    // Show league nav item when team belongs to a league and has Pro tier
    ...(leagueId && canLeague ? [{ href: '/league', label: leagueName ?? 'League', icon: '🏆' }] : []),
    // Player profile link for users who also have a player profile
    ...(hasPlayerProfile ? [{ href: '/players/me', label: 'My Profile', icon: '🎖️' }] : []),
    // Non-platform-admins see the generic Admin link; platform admins get the dedicated link below
    ...(!isPlatformAdmin ? [{ href: '/admin', label: 'Admin', icon: '⚙️' }] : []),
  ];

  const adminNavItems = [
    { href: '/admin',              label: 'Overview',      icon: '🏠' },
    { href: '/admin/teams',        label: 'All Teams',     icon: '🏟️' },
    { href: '/admin/leagues',      label: 'All Leagues',   icon: '🏆' },
    { href: '/admin/users',        label: 'All Users',     icon: '👥' },
    { href: '/admin/players',      label: 'Player Pro',    icon: '🎖️' },
    { href: '/admin/create-team',  label: 'Create Team',   icon: '➕' },
    { href: '/admin/billing',      label: 'Billing',       icon: '💳' },
  ];

  const navItems = isAdminPanel ? adminNavItems : teamNavItems;

  async function handleSignOut() {
    const supabase = createBrowserClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <aside
      className={`${collapsed ? 'w-16' : 'w-64'} text-white flex flex-col transition-all duration-200 shrink-0`}
      style={{ backgroundColor: bg, '--sidebar-active': active } as React.CSSProperties}
    >
      <div className={`${collapsed ? 'p-3' : 'p-6'} border-b border-white/10`}>
        {isAdminPanel ? (
          <>
            <div className={`text-2xl ${collapsed ? 'text-center' : 'mb-2'}`}>&#9881;</div>
            {!collapsed && (
              <>
                <h1 className="text-xl font-bold leading-tight">Platform Admin</h1>
                <p className="text-xs text-white/60 mt-0.5">System Administration</p>
              </>
            )}
          </>
        ) : (
          <>
            {logoUrl && (
              <div className={collapsed ? 'flex justify-center' : 'mb-3'}>
                <Image
                  src={logoUrl}
                  alt="Team logo"
                  width={80}
                  height={80}
                  className={`${collapsed ? 'h-8 w-8' : 'h-12 w-auto'} object-contain`}
                  unoptimized
                />
              </div>
            )}
            {!collapsed && (
              <>
                <h1 className="text-xl font-bold leading-tight">{teamName ?? 'Baseball Coaches'}</h1>
                {teamOrg && (
                  <p className="text-xs text-white/60 mt-0.5 truncate">{teamOrg}</p>
                )}
              </>
            )}
          </>
        )}
      </div>

      <nav className={`flex-1 ${collapsed ? 'p-2' : 'p-4'} space-y-1`}>
        {navItems.map((item) => {
          const isActive = isAdminPanel
            ? (item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href))
            : pathname.startsWith(item.href);
          return (
            <Link
              key={item.label}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={`flex items-center ${collapsed ? 'justify-center px-2' : 'gap-3 px-4'} py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'text-white'
                  : 'text-white/70 hover:bg-white/10 hover:text-white'
              }`}
              style={isActive ? { backgroundColor: active } : undefined}
            >
              <span>{item.icon}</span>
              {!collapsed && item.label}
            </Link>
          );
        })}

        {isAdminPanel && teamId && (
          <>
            <div className="border-t border-white/10 my-3" />
            <a
              href="/dashboard"
              title={collapsed ? 'Back to Team' : undefined}
              className={`flex items-center ${collapsed ? 'justify-center px-2' : 'gap-3 px-4'} py-2.5 rounded-lg text-sm font-medium text-white/70 hover:bg-white/10 hover:text-white transition-colors`}
            >
              <span>↩</span>
              {!collapsed && 'Back to Team'}
            </a>
          </>
        )}

        {!isAdminPanel && isPlatformAdmin && (
          <>
            <div className="border-t border-white/10 my-3" />
            <a
              href="/admin"
              title={collapsed ? 'Platform Admin' : undefined}
              className={`flex items-center ${collapsed ? 'justify-center px-2' : 'gap-3 px-4'} py-2.5 rounded-lg text-sm font-medium text-white/70 hover:bg-white/10 hover:text-white transition-colors`}
            >
              <span>&#9881;</span>
              {!collapsed && 'Platform Admin'}
            </a>
          </>
        )}
      </nav>

      <div className={`${collapsed ? 'p-2' : 'p-4'} border-t border-white/10 space-y-1`}>
        <button
          onClick={toggleCollapsed}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={`flex items-center ${collapsed ? 'justify-center px-2' : 'gap-3 px-4'} py-2.5 rounded-lg text-sm font-medium text-white/70 hover:bg-white/10 hover:text-white transition-colors w-full`}
        >
          <span>{collapsed ? '»' : '«'}</span>
          {!collapsed && 'Collapse'}
        </button>
        <button
          onClick={handleSignOut}
          title={collapsed ? 'Sign Out' : undefined}
          className={`flex items-center ${collapsed ? 'justify-center px-2' : 'gap-3 px-4'} py-2.5 rounded-lg text-sm font-medium text-white/70 hover:bg-white/10 hover:text-white transition-colors w-full`}
        >
          <span>🚪</span>
          {!collapsed && 'Sign Out'}
        </button>
      </div>
    </aside>
  );
}
