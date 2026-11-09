/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';
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
});
