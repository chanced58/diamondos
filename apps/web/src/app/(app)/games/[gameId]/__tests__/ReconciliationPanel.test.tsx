/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';
import type { ScoreConflict } from '@baseball/shared';
import { ReconciliationPanel } from '../ReconciliationPanel';

jest.mock('../actions', () => ({ resolveReconciliationConflictAction: jest.fn() }));
jest.mock('react-dom', () => ({
  ...jest.requireActual('react-dom'),
  // A string action: React 18's DOM warns on a function form action outside Next.
  useFormState: (_action: unknown, initial: unknown) => [initial, '/settle'],
  useFormStatus: () => ({ pending: false }),
}));

const conflicts: ScoreConflict[] = [
  { kind: 'final_score', side: 'away', homeLog: 1, awayLog: 2 },
  { kind: 'player_batting', playerId: 'p-ada', stat: 'hits', homeLog: 1, awayLog: 2 },
  { kind: 'player_batting', playerId: 'p-ada', stat: 'rbi', homeLog: 0, awayLog: 1 },
  { kind: 'player_pitching', playerId: 'p-bo', stat: 'strikeouts', homeLog: 3, awayLog: 4 },
];

function renderPanel(overrides = [] as { key: string; useAwayValue: boolean }[]) {
  return render(
    <ReconciliationPanel
      reconciliationId="recon-1"
      conflicts={conflicts}
      overrides={overrides}
      canOverride
      homeTeamLabel="Hawks"
      awayTeamLabel="Bears"
      playerNames={{ 'p-ada': 'Ada Abbott', 'p-bo': 'Bo Baker' }}
    />,
  );
}

describe('ReconciliationPanel', () => {
  it('should name players and offer one choice per player', () => {
    const { container } = renderPanel();
    expect(screen.getByText('Ada Abbott')).toBeTruthy();
    expect(screen.getByText('Bo Baker')).toBeTruthy();
    expect(screen.queryByText(/player p-ada/)).toBeNull();
    // The final score, Ada (two differences) and Bo: three choices.
    const keys = [...container.querySelectorAll('input[name="conflictKey"]')].map((input) => (input as HTMLInputElement).value);
    expect(keys).toEqual(['final_score:away', 'player_batting:p-ada:hits', 'player_pitching:p-bo:strikeouts']);
    expect(screen.getAllByRole('button', { name: 'Use Bears line' })).toHaveLength(2);
  });

  it("should show a player's whole line accepted when any of it was", () => {
    const { container } = renderPanel([{ key: 'player_batting:p-ada:rbi', useAwayValue: true }]);
    expect(screen.getByRole('button', { name: 'Revert to Hawks' })).toBeTruthy();
    const choices = [...container.querySelectorAll('input[name="useAwayValue"]')].map((input) => (input as HTMLInputElement).value);
    expect(choices).toEqual(['true', 'false', 'true']);
  });
});
