/** @jest-environment jsdom */
import { fireEvent, render, screen } from '@testing-library/react';
import { ErrorScreen } from '../ErrorScreen';
import { reportClientError } from '@/lib/errors/report-client-error';

jest.mock('@/lib/errors/report-client-error', () => ({ reportClientError: jest.fn() }));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const error = Object.assign(new Error('boom'), { digest: 'abc123' });

function screenFor(onAction = jest.fn(), homeHref?: string) {
  return (
    <ErrorScreen
      title="Something went wrong"
      body="The page hit an error. Your data is safe."
      actionLabel="Try again"
      onAction={onAction}
      error={error}
      homeHref={homeHref}
    />
  );
}

describe('ErrorScreen', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should render the title, body and action', () => {
    render(screenFor());
    expect(screen.getByText('Something went wrong')).toBeTruthy();
    expect(screen.getByText('The page hit an error. Your data is safe.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });

  it('should call onAction when the action is clicked', () => {
    const onAction = jest.fn();
    render(screenFor(onAction));
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('should render a home link only when homeHref is given', () => {
    const { rerender } = render(screenFor());
    expect(screen.queryByRole('link')).toBeNull();
    rerender(screenFor(jest.fn(), '/dashboard'));
    expect(screen.getByRole('link', { name: 'Go to home' }).getAttribute('href')).toBe('/dashboard');
  });

  it('should report the error exactly once across a re-render', () => {
    const { rerender } = render(screenFor());
    rerender(screenFor());
    expect(reportClientError).toHaveBeenCalledTimes(1);
    expect(reportClientError).toHaveBeenCalledWith('render', error, {
      pathname: window.location.pathname,
      digest: 'abc123',
    });
  });
});
