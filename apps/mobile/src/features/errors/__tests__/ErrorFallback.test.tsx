import { fireEvent, render, screen } from '@testing-library/react-native';
import { ErrorFallback } from '../ErrorFallback';
import { reportClientError } from '../../../lib/error-report';

jest.mock('../../../lib/error-report', () => ({ reportClientError: jest.fn() }));

const reportMock = reportClientError as jest.Mock;

describe('ErrorFallback', () => {
  beforeEach(() => reportMock.mockClear());

  it('should show the app copy and retry when the button is pressed', () => {
    const retry = jest.fn();
    render(<ErrorFallback error={new Error('boom')} retry={retry} variant="app" />);

    expect(screen.getByText('Something went wrong')).toBeTruthy();
    expect(screen.getByText('Plays recorded on this phone are saved.')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('should show the scorer copy and retry when the button is pressed', () => {
    const retry = jest.fn();
    render(<ErrorFallback error={new Error('boom')} retry={retry} variant="scorer" />);

    expect(screen.getByText('The scorer hit an error')).toBeTruthy();
    expect(screen.getByText('Plays you already recorded are saved on this phone.')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Reopen scorer' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('should report the render error once, even across re-renders', () => {
    const error = new Error('boom');
    const { rerender } = render(<ErrorFallback error={error} retry={jest.fn()} variant="scorer" gameId="g1" />);
    rerender(<ErrorFallback error={error} retry={jest.fn()} variant="scorer" gameId="g1" />);

    expect(reportMock).toHaveBeenCalledTimes(1);
    expect(reportMock).toHaveBeenCalledWith('render', error, {
      gameId: 'g1',
      details: { variant: 'scorer' },
    });
  });
});
