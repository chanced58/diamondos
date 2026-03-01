'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: '⚾' },
  { href: '/games', label: 'Schedule', icon: '📋' },
  { href: '/practices', label: 'Practices', icon: '🏋️' },
  { href: '/teams', label: 'Roster', icon: '👥' },
  { href: '/compliance', label: 'Stats', icon: '📊' },
  { href: '/messages', label: 'Messages', icon: '💬' },
  { href: '/admin', label: 'Admin', icon: '⚙️' },
];

export function Sidebar({ teamName, teamOrg }: { teamName?: string; teamOrg?: string }) {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-brand-900 text-white flex flex-col">
      <div className="p-6 border-b border-brand-700">
        <div>
          <h1 className="text-xl font-bold leading-tight">{teamName ?? 'Baseball Coaches'}</h1>
          {teamOrg && (
            <p className="text-xs text-blue-300 mt-0.5 truncate">{teamOrg}</p>
          )}
        </div>
      </div>
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-brand-700 text-white'
                  : 'text-blue-200 hover:bg-brand-800 hover:text-white'
              }`}
            >
              <span>{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
