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

/** The conflict key and choice each settle form submits, in order. */
function forms(container: HTMLElement): [string, string][] {
  return [...container.querySelectorAll('form')].map((form) => [
    (form.querySelector('input[name="conflictKey"]') as HTMLInputElement).value,
    (form.querySelector('input[name="useAwayValue"]') as HTMLInputElement).value,
  ]);
}

describe('ReconciliationPanel', () => {
  it('should name players and offer both choices for each undecided group', () => {
    const { container } = renderPanel();
    expect(screen.getByText('Ada Abbott')).toBeTruthy();
    expect(screen.getByText('Bo Baker')).toBeTruthy();
    expect(screen.queryByText(/player p-ada/)).toBeNull();
    // The final score, Ada (two differences) and Bo: three choices, each
    // offering the home value and the away value.
    expect(forms(container)).toEqual([
      ['final_score:away', 'false'], ['final_score:away', 'true'],
      ['player_batting:p-ada:hits', 'false'], ['player_batting:p-ada:hits', 'true'],
      ['player_pitching:p-bo:strikeouts', 'false'], ['player_pitching:p-bo:strikeouts', 'true'],
    ]);
    expect(screen.getAllByRole('button', { name: 'Keep Hawks line' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Use Bears line' })).toHaveLength(2);
    expect(screen.getByText(/3 still to settle/)).toBeTruthy();
  });

  it("should show a player's whole line accepted when any of it was", () => {
    const { container } = renderPanel([{ key: 'player_batting:p-ada:rbi', useAwayValue: true }]);
    expect(screen.getByRole('button', { name: 'Use Hawks line' })).toBeTruthy();
    expect(forms(container).filter(([key]) => key === 'player_batting:p-ada:hits')).toEqual([
      ['player_batting:p-ada:hits', 'false'],
    ]);
    expect(screen.getByText(/2 still to settle/)).toBeTruthy();
  });

  it('should count keeping the home value as a decision', () => {
    const { container } = renderPanel([{ key: 'player_pitching:p-bo:strikeouts', useAwayValue: false }]);
    // Bo is decided for the home line: only the away choice is left to switch to.
    expect(forms(container).filter(([key]) => key === 'player_pitching:p-bo:strikeouts')).toEqual([
      ['player_pitching:p-bo:strikeouts', 'true'],
    ]);
    expect(screen.getByText(/2 still to settle/)).toBeTruthy();
  });

  it('should say all are settled once every group has a choice', () => {
    renderPanel([
      { key: 'final_score:away', useAwayValue: false },
      { key: 'player_batting:p-ada:hits', useAwayValue: true },
      { key: 'player_pitching:p-bo:strikeouts', useAwayValue: false },
    ]);
    expect(screen.getByText(/all settled/)).toBeTruthy();
    expect(screen.queryByText(/Not settled/)).toBeNull();
  });
});
