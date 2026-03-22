import type { JSX, ReactNode } from 'react';
import { getChannelSidebarData } from './get-channels';
import { ChannelSidebar } from './ChannelSidebar';

export default async function MessagesLayout({
  children,
}: {
  children: ReactNode;
}): Promise<JSX.Element> {
  const data = await getChannelSidebarData();

  if (!data) {
    return <div className="p-8 text-gray-400">No team found. Create or join a team first.</div>;
  }

  return (
    <div className="flex h-full overflow-hidden">
      <ChannelSidebar {...data} />
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {children}
      </div>
    </div>
  );
}
