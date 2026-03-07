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
}

export function Sidebar({ teamName, teamOrg, teamId, logoUrl, primaryColor, secondaryColor }: SidebarProps): JSX.Element | null {
  const pathname = usePathname();
  const router = useRouter();

  const bg     = primaryColor   ?? '#1e2d6b';
  const active = secondaryColor ?? '#1e3a8a';

  const navItems = [
    { href: '/dashboard',                                  label: 'Dashboard',       icon: '⚾' },
    { href: '/games',                                      label: 'Schedule',        icon: '📋' },
    { href: '/practices',                                  label: 'Practices',       icon: '🏋️' },
    { href: teamId ? `/teams/${teamId}/admin` : '/teams',  label: 'Team Management', icon: '👥' },
    { href: '/compliance',                                 label: 'Stats',           icon: '📊' },
    { href: '/messages',                                   label: 'Messages',        icon: '💬' },
    { href: '/admin',                                      label: 'Admin',           icon: '⚙️' },
  ];

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
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
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
