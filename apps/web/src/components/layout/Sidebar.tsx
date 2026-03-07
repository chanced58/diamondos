'use client';
import type { JSX } from 'react';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createBrowserClient } from '@/lib/supabase/client';

interface SidebarProps {
  teamName?: string;
  teamOrg?: string;
  teamId?: string;
  logoUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  isPlatformAdmin?: boolean;
}

export function Sidebar({ teamName, teamOrg, teamId, logoUrl, primaryColor, secondaryColor, isPlatformAdmin }: SidebarProps): JSX.Element | null {
  const pathname = usePathname();
  const router = useRouter();

  // Platform admin on /admin routes = neutral mode (no team branding)
  const isAdminPanel = isPlatformAdmin && pathname.startsWith('/admin');

  const bg     = isAdminPanel ? '#1f2937' : (primaryColor   ?? '#1e2d6b');
  const active = isAdminPanel ? '#374151' : (secondaryColor ?? '#1e3a8a');

  const teamNavItems = [
    { href: '/dashboard',                                  label: 'Dashboard',       icon: '⚾' },
    { href: '/games',                                      label: 'Schedule',        icon: '📋' },
    { href: '/practices',                                  label: 'Practices',       icon: '🏋️' },
    { href: teamId ? `/teams/${teamId}/admin` : '/teams',  label: 'Team Management', icon: '👥' },
    { href: '/compliance',                                 label: 'Stats',           icon: '📊' },
    { href: '/messages',                                   label: 'Messages',        icon: '💬' },
    // Non-platform-admins see the generic Admin link; platform admins get the dedicated link below
    ...(!isPlatformAdmin ? [{ href: '/admin', label: 'Admin', icon: '⚙️' }] : []),
  ];

  const adminNavItems = [
    { href: '/admin',              label: 'Overview',     icon: '🏠' },
    { href: '/admin/teams',        label: 'All Teams',    icon: '🏟️' },
    { href: '/admin/users',        label: 'All Users',    icon: '👥' },
    { href: '/admin/create-team',  label: 'Create Team',  icon: '➕' },
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
      className="w-64 text-white flex flex-col"
      style={{ backgroundColor: bg, '--sidebar-active': active } as React.CSSProperties}
    >
      <div className="p-6 border-b border-white/10">
        {isAdminPanel ? (
          <>
            <div className="text-2xl mb-2">&#9881;</div>
            <h1 className="text-xl font-bold leading-tight">Platform Admin</h1>
            <p className="text-xs text-white/60 mt-0.5">System Administration</p>
          </>
        ) : (
          <>
            {logoUrl && (
              <div className="mb-3">
                <Image
                  src={logoUrl}
                  alt="Team logo"
                  width={80}
                  height={80}
                  className="h-12 w-auto object-contain"
                  unoptimized
                />
              </div>
            )}
            <h1 className="text-xl font-bold leading-tight">{teamName ?? 'Baseball Coaches'}</h1>
            {teamOrg && (
              <p className="text-xs text-white/60 mt-0.5 truncate">{teamOrg}</p>
            )}
          </>
        )}
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => {
          const isActive = isAdminPanel
            ? (item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href))
            : pathname.startsWith(item.href);
          return (
            <Link
              key={item.label}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'text-white'
                  : 'text-white/70 hover:bg-white/10 hover:text-white'
              }`}
              style={isActive ? { backgroundColor: active } : undefined}
            >
              <span>{item.icon}</span>
              {item.label}
            </Link>
          );
        })}

        {isAdminPanel && teamId && (
          <>
            <div className="border-t border-white/10 my-3" />
            <a
              href="/dashboard"
              className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-white/70 hover:bg-white/10 hover:text-white transition-colors"
            >
              <span>↩</span>
              Back to Team
            </a>
          </>
        )}

        {!isAdminPanel && isPlatformAdmin && (
          <>
            <div className="border-t border-white/10 my-3" />
            <a
              href="/admin"
              className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-white/70 hover:bg-white/10 hover:text-white transition-colors"
            >
              <span>&#9881;</span>
              Platform Admin
            </a>
          </>
        )}
      </nav>

      <div className="p-4 border-t border-white/10">
        <button
          onClick={handleSignOut}
          className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-white/70 hover:bg-white/10 hover:text-white transition-colors w-full"
        >
          <span>🚪</span>
          Sign Out
        </button>
      </div>
    </aside>
  );
}
