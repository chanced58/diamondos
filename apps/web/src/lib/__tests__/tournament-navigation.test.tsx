import { renderToStaticMarkup } from 'react-dom/server';
import { Sidebar } from '../../components/layout/Sidebar';

jest.mock('next/navigation', () => ({ usePathname: () => '/games', useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }) }));
jest.mock('@/lib/supabase/client', () => ({ createBrowserClient: jest.fn() }));
jest.mock('@/components/providers/SidebarProvider', () => ({ useSidebar: () => ({ collapsed: false, toggle: jest.fn() }) }));

it('keeps tournament navigation available to team members without the creation grant', () => {
  const markup = renderToStaticMarkup(<Sidebar teamName="Lions" tournamentModeEnabled={false} userRole="assistant_coach" />);
  expect(markup).toContain('href="/tournaments"');
  expect(markup).toContain('Tournaments');
});
