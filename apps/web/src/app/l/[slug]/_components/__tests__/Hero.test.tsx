/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';
import { Hero } from '../Hero';

const theme = { bannerUrl: null, heroTitle: '', heroTagline: '' };

function renderHero(teams: number, games: number) {
  render(
    <Hero
      name="Metro League"
      logoUrl={null}
      theme={theme}
      counters={{ teams, games, season: '2027' }}
      seasons={['2027']}
      activeSeason="2027"
      slug="metro"
      updatedAt={null}
    />,
  );
}

describe('Hero', () => {
  it('should say "1 game" and "1 team" in the singular', () => {
    renderHero(1, 1);
    expect(screen.getByText('game', { exact: false }).textContent).toBe('1 game');
    expect(screen.getByText('team', { exact: false }).textContent).toBe('1 team');
  });

  it('should pluralise counts other than one', () => {
    renderHero(4, 0);
    expect(screen.getByText('games', { exact: false }).textContent).toBe('0 games');
    expect(screen.getByText('teams', { exact: false }).textContent).toBe('4 teams');
  });
});
