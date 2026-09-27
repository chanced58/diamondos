import { render, fireEvent, screen } from '@testing-library/react-native';
import { ThrowSequenceModal } from '../ThrowSequenceModal';

function readout() {
  return screen.getByTestId('throw-sequence-readout').props.children;
}

describe('ThrowSequenceModal', () => {
  it('should start the sequence with the first fielder', () => {
    render(<ThrowSequenceModal visible firstFielder={6} onDone={jest.fn()} />);
    expect(readout()).toBe('6');
  });

  it('should append tapped fielders in order and undo the last one', () => {
    render(<ThrowSequenceModal visible firstFielder={6} onDone={jest.fn()} />);
    fireEvent.press(screen.getByTestId('throw-position-4'));
    fireEvent.press(screen.getByTestId('throw-position-3'));
    expect(readout()).toBe('6 → 4 → 3');
    fireEvent.press(screen.getByTestId('throw-undo'));
    expect(readout()).toBe('6 → 4');
  });

  it('should never undo the first fielder', () => {
    render(<ThrowSequenceModal visible firstFielder={6} onDone={jest.fn()} />);
    fireEvent.press(screen.getByTestId('throw-undo'));
    expect(readout()).toBe('6');
  });

  it('should stop at five positions', () => {
    render(<ThrowSequenceModal visible firstFielder={6} onDone={jest.fn()} />);
    for (const position of [4, 3, 4, 3, 1]) {
      fireEvent.press(screen.getByTestId(`throw-position-${position}`));
    }
    expect(readout()).toBe('6 → 4 → 3 → 4 → 3');
  });

  it('should hand back the sequence on Done — a caught fly is just the first fielder', () => {
    const onDone = jest.fn();
    render(<ThrowSequenceModal visible firstFielder={8} onDone={onDone} />);
    fireEvent.press(screen.getByTestId('throw-done'));
    expect(onDone).toHaveBeenCalledWith([8]);
  });

  it('should show the throw-step title by default', () => {
    render(<ThrowSequenceModal visible firstFielder={6} onDone={jest.fn()} />);
    expect(screen.getByText('Where was it thrown?')).toBeTruthy();
  });

  it('should show a custom title and subtitle when given', () => {
    render(
      <ThrowSequenceModal
        visible
        firstFielder={null}
        title="Bob thrown out — who made the play?"
        subtitle="Tap each fielder in order."
        onDone={jest.fn()}
      />,
    );
    expect(screen.getByText('Bob thrown out — who made the play?')).toBeTruthy();
    expect(screen.getByText('Tap each fielder in order.')).toBeTruthy();
    expect(screen.queryByText('Where was it thrown?')).toBeNull();
  });

  it('should let Undo clear the first fielder when it is not locked', () => {
    const onDone = jest.fn();
    render(
      <ThrowSequenceModal visible firstFielder={8} lockFirstFielder={false} onDone={onDone} />,
    );
    fireEvent.press(screen.getByTestId('throw-undo'));
    expect(readout()).toBe('');
    fireEvent.press(screen.getByTestId('throw-position-9'));
    fireEvent.press(screen.getByTestId('throw-position-2'));
    fireEvent.press(screen.getByTestId('throw-done'));
    expect(onDone).toHaveBeenCalledWith([9, 2]);
  });
});
