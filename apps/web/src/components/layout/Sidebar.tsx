'use client';
import type { JSX, ReactNode } from 'react';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createBrowserClient } from '@/lib/supabase/client';
import { SubscriptionTier, hasFeature, Feature } from '@baseball/shared';
import { BrandMark } from '@/components/ui/BrandMark';
import { Icon } from '@/components/ui/icons';

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
  isLeagueAdmin?: boolean;
  userInitials?: string;
  userName?: string;
  userRole?: string;
}

type NavItem = {
  href: string;
  label: string;
  icon: ReactNode;
  badge?: string | number;
};

export function Sidebar({
  teamName,
  teamOrg,
  teamId,
  logoUrl,
  primaryColor,
  secondaryColor,
  isPlatformAdmin,
  leagueId,
  leagueName,
  subscriptionTier = SubscriptionTier.FREE,
  hasPlayerProfile,
  isLeagueAdmin,
  userInitials,
  userName = 'Coach',
  userRole,
}: SidebarProps): JSX.Element | null {
  const pathname = usePathname();
  const router = useRouter();

  const isAdminPanel = isPlatformAdmin && pathname.startsWith('/admin');

  const canPractices = hasFeature(subscriptionTier, Feature.PRACTICE_PLANNING);
  const canLeague = hasFeature(subscriptionTier, Feature.LEAGUE_MANAGEMENT);

  const teamNavItems: NavItem[] = [
    { href: '/dashboard', label: 'Dashboard', icon: <Icon.dash /> },
    { href: '/games',     label: 'Schedule',  icon: <Icon.sched /> },
    ...(canPractices ? [{ href: '/practices', label: 'Practices', icon: <Icon.prac /> }] : []),
    { href: '/compliance', label: 'Stats', icon: <Icon.stats /> },
    { href: '/messages',   label: 'Messages', icon: <Icon.msg /> },
    {
      href: teamId ? `/teams/${teamId}/admin` : '/teams',
      label: 'Roster',
      icon: <Icon.team />,
    },
    ...(leagueId && canLeague
      ? [{ href: '/league', label: leagueName ?? 'League', icon: <Icon.admin /> }]
      : []),
    ...(leagueId && canLeague && isLeagueAdmin
      ? [{ href: '/league/admin', label: 'League Admin', icon: <Icon.admin /> }]
      : []),
    ...(hasPlayerProfile
      ? [{ href: '/players/me', label: 'My Profile', icon: <Icon.team /> }]
      : []),
    ...(!isPlatformAdmin ? [{ href: '/admin', label: 'Admin', icon: <Icon.gear /> }] : []),
  ];

  const adminNavItems: NavItem[] = [
    { href: '/admin',             label: 'Overview',    icon: <Icon.dash /> },
    { href: '/admin/teams',       label: 'All Teams',   icon: <Icon.team /> },
    { href: '/admin/leagues',     label: 'All Leagues', icon: <Icon.admin /> },
    { href: '/admin/users',       label: 'All Users',   icon: <Icon.team /> },
    { href: '/admin/players',     label: 'Player Pro',  icon: <Icon.team /> },
    { href: '/admin/create-team', label: 'Create Team', icon: <Icon.plus /> },
    { href: '/admin/billing',     label: 'Billing',     icon: <Icon.stats /> },
  ];

  const navItems = isAdminPanel ? adminNavItems : teamNavItems;

  async function handleSignOut(): Promise<void> {
    const supabase = createBrowserClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  // Tenant branding override: when a team sets a custom primaryColor, apply it
  // as the sidebar background (overrides theme sidebar-bg var for this sidebar only).
  const brandingStyle = !isAdminPanel && primaryColor
    ? { '--app-sidebar-bg': primaryColor, '--app-sidebar-active': secondaryColor ?? primaryColor } as React.CSSProperties
    : undefined;

  return (
    <aside className="sidebar" style={brandingStyle}>
      <div className="sb-brand">
        {isAdminPanel ? (
          <BrandMark />
        ) : logoUrl ? (
          <div
            className="sb-logo"
            style={{ padding: 0, background: 'transparent', boxShadow: 'none' }}
          >
            <Image
              src={logoUrl}
              alt="Team logo"
              width={34}
              height={34}
              className="rounded-[10px] object-contain"
              unoptimized
            />
          </div>
        ) : (
          <BrandMark />
        )}
        <div style={{ minWidth: 0 }}>
          <div className="sb-team">
            {isAdminPanel ? 'Platform Admin' : (teamName ?? 'DiamondOS')}
          </div>
          <div className="sb-team-sub">
            {isAdminPanel ? 'System Administration' : (teamOrg ?? 'Coach dashboard')}
          </div>
        </div>
      </div>

      {!isAdminPanel && (
        <Link
          href="/games/live"
          className="sb-next"
          style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
        >
          <span className="live">
            <span className="pulse" />
            Next up
          </span>
          <div className="matchup">{teamName ? `${teamName} · Upcoming` : 'No game scheduled'}</div>
          <div className="inning">See schedule for details</div>
        </Link>
      )}

      <nav className="sb-nav" style={{ marginTop: 14 }}>
        {navItems.map((item) => {
          const isActive = isAdminPanel
            ? item.href === '/admin'
              ? pathname === '/admin'
              : pathname.startsWith(item.href)
            : pathname.startsWith(item.href);
          return (
            <Link
              key={item.label}
              href={item.href}
              className={`sb-item ${isActive ? 'active' : ''}`}
              style={{ textDecoration: 'none' }}
            >
              <span className="ico">{item.icon}</span>
              <span>{item.label}</span>
              {item.badge != null &&
                (typeof item.badge === 'number' ? (
                  <span className="badge-count">{item.badge}</span>
                ) : (
                  <span
                    className="badge-count"
                    style={{ background: '#dc2626', color: 'white' }}
                  >
                    {item.badge}
                  </span>
                ))}
            </Link>
          );
        })}

        {isAdminPanel && teamId && (
          <>
            <div style={{ height: 1, background: 'rgba(255,255,255,.08)', margin: '10px 4px' }} />
            <Link href="/dashboard" className="sb-item" style={{ textDecoration: 'none' }}>
              <span className="ico"><Icon.chev style={{ transform: 'rotate(180deg)' }} /></span>
              <span>Back to Team</span>
            </Link>
          </>
        )}

        {!isAdminPanel && isPlatformAdmin && (
          <>
            <div style={{ height: 1, background: 'rgba(255,255,255,.08)', margin: '10px 4px' }} />
            <Link href="/admin" className="sb-item" style={{ textDecoration: 'none' }}>
              <span className="ico"><Icon.gear /></span>
              <span>Platform Admin</span>
            </Link>
          </>
        )}

        {!isAdminPanel && (
          <Link href="/settings/appearance" className="sb-item" style={{ textDecoration: 'none' }}>
            <span className="ico"><Icon.gear /></span>
            <span>Appearance</span>
          </Link>
        )}
      </nav>

      <div className="sb-foot">
        <div className="avatar">{userInitials ?? userName.slice(0, 1).toUpperCase()}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="name">{userName}</div>
          <div className="role">{userRole ?? (isPlatformAdmin ? 'Admin' : 'Head Coach')}</div>
        </div>
        <button
          onClick={handleSignOut}
          title="Sign out"
          className="btn btn-sm"
          style={{ padding: '4px 8px', border: 'none', color: 'rgba(255,255,255,.55)', background: 'none' }}
        >
          <Icon.signout />
        </button>
      </div>
    </aside>
  );
}
