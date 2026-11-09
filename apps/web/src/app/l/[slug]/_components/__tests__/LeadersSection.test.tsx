/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';
import { getStatDef } from '@baseball/shared';
import type { LeaderBoardResult } from '@/lib/league-home/load';
import { LeadersSection } from '../LeadersSection';

describe('LeadersSection', () => {
  it('links to the full league stats page', () => {
    render(
      <LeadersSection
        boards={{ batting: [], pitching: [], team: [], special: [] }}
        slug="demo"
        season="2026"
        statsHref="/l/demo/stats?season=2026"
      />,
    );
    const link = screen.getByRole('link', { name: 'Full league stats →' });
    expect(link.getAttribute('href')).toBe('/l/demo/stats?season=2026');
  });

  it('keeps the link beside the tabs when several categories show', () => {
    const board = (key: 'avg' | 'era'): LeaderBoardResult => ({ def: getStatDef(key), label: key, rows: [] });
    render(
      <LeadersSection
        boards={{ batting: [board('avg')], pitching: [board('era')], team: [], special: [] }}
        slug="demo"
        season="2026"
        statsHref="/l/demo/stats?season=2026"
      />,
    );
    const link = screen.getByRole('link', { name: 'Full league stats →' });
    expect(link.getAttribute('href')).toBe('/l/demo/stats?season=2026');
    const tablist = screen.getByRole('tablist', { name: 'Leaderboard category' });
    // One right-aligned group holds both, so the link never floats mid-row.
    expect(link.parentElement).toBe(tablist.parentElement);
    expect(link.parentElement?.className).toContain('ml-auto');
  });
});
