'use client';

import type { JSX } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ChannelSidebarData, SidebarChannel } from './get-channels';

export function ChannelSidebar({
  announcements,
  topics,
  dms,
  isCoach,
  teamName,
  userId,
}: ChannelSidebarData): JSX.Element {
  const pathname = usePathname();

  function getDmDisplayName(channel: SidebarChannel): string {
    const other = channel.channel_members.find((m) => m.user_id !== userId);
    if (!other?.user_profiles) return 'Unknown';
    return `${other.user_profiles.first_name} ${other.user_profiles.last_name}`;
  }

  function isActive(channelId: string) {
    return pathname === `/messages/${channelId}`;
  }

  return (
    <div className="w-72 shrink-0 bg-gray-50 border-r border-gray-200 flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 px-5 py-4 border-b border-gray-200">
        <h2 className="text-base font-bold text-gray-900">Messages</h2>
        <p className="text-xs text-gray-500 mt-0.5">{teamName}</p>
      </div>

      {/* Scrollable channel list */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
        {/* Announcements */}
        {announcements.length > 0 && (
          <Section label="Announcements">
            {announcements.map((ch) => (
              <ChannelLink
                key={ch.id}
                href={`/messages/${ch.id}`}
                icon="📢"
                label={ch.name}
                active={isActive(ch.id)}
              />
            ))}
          </Section>
        )}

        {/* Channels */}
        {topics.length > 0 && (
          <Section label="Channels">
            {topics.map((ch) => (
              <ChannelLink
                key={ch.id}
                href={`/messages/${ch.id}`}
                icon="#"
                label={ch.name}
                active={isActive(ch.id)}
              />
            ))}
          </Section>
        )}

        {/* Direct Messages */}
        {dms.length > 0 && (
          <Section label="Direct Messages">
            {dms.map((ch) => (
              <ChannelLink
                key={ch.id}
                href={`/messages/${ch.id}`}
                icon="💬"
                label={getDmDisplayName(ch)}
                active={isActive(ch.id)}
              />
            ))}
          </Section>
        )}
      </div>

      {/* Footer actions */}
      <div className="shrink-0 px-3 py-3 border-t border-gray-200 flex gap-2">
        {isCoach && (
          <Link
            href="/messages/new"
            className="flex-1 text-center text-xs font-medium bg-brand-700 text-white px-3 py-2 rounded-lg hover:bg-brand-800 transition-colors"
          >
            + Channel
          </Link>
        )}
        <Link
          href="/messages/dm/new"
          className={`${isCoach ? 'flex-1' : 'w-full'} text-center text-xs font-medium bg-white border border-gray-300 text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors`}
        >
          + DM
        </Link>
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider px-2 mb-1">
        {label}
      </p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function ChannelLink({
  href,
  icon,
  label,
  active,
}: {
  href: string;
  icon: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-sm truncate transition-colors ${
        active
          ? 'bg-brand-100 text-brand-900 font-semibold'
          : 'text-gray-700 hover:bg-gray-100'
      }`}
    >
      <span className="text-gray-400 font-mono text-xs w-5 text-center shrink-0">{icon}</span>
      <span className="truncate">{label}</span>
    </Link>
  );
}
