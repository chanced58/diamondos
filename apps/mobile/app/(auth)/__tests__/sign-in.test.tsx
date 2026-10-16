import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { ScrollView, TouchableOpacity } from 'react-native';
import SignInScreen from '../sign-in';

/**
 * Covers W7 — two findings on the sign-in screen (w7-brief.md):
 *
 * M1: "Use a different email" was a bare `<Text>` inside a `TouchableOpacity`
 * with no padding — the only exit from the "Check your email" screen, with a
 * tappable height of ~20pt against Apple's 44pt minimum.
 *
 * M5: sign-in was the only screen in the app with no scroll container, so
 * content could be pushed past the viewport (accessibility text sizing, a
 * landscape keyboard) with no way to reach it.
 *
 * RNTL performs no real layout, so none of this can assert a measured 44pt
 * hit target or a measured scroll offset. What follows instead pins *intent*:
 * the props that are supposed to produce a ≥44pt target, and the presence of
 * a scroll container in both branches. If a future edit strips the padding
 * back off, or swaps the ScrollView for a plain View, these tests catch that
 * even though they never render anything to a real screen.
 */

const mockSignInWithOtp = jest.fn();
const mockVerifyOtp = jest.fn();
const mockSignInWithOAuth = jest.fn();
const mockExchangeCodeForSession = jest.fn();
const mockOpenAuthSession = jest.fn();

jest.mock('../../../src/lib/supabase', () => ({
  getSupabaseClient: () => ({
    auth: {
      signInWithOtp: (...args: unknown[]) => mockSignInWithOtp(...args),
      verifyOtp: (...args: unknown[]) => mockVerifyOtp(...args),
      signInWithOAuth: (...args: unknown[]) => mockSignInWithOAuth(...args),
      exchangeCodeForSession: (...args: unknown[]) => mockExchangeCodeForSession(...args),
    },
  }),
}));

jest.mock('expo-web-browser', () => ({
  __esModule: true,
  openAuthSessionAsync: (...args: unknown[]) => mockOpenAuthSession(...args),
}));

jest.mock('expo-router', () => ({
  __esModule: true,
  router: { replace: jest.fn(), push: jest.fn() },
}));

beforeEach(() => {
  jest.clearAllMocks();
});

/**
 * `getByTestId` resolves to the underlying host node (e.g. the native
 * `RCTScrollView`/pressability view), which does not carry the composite
 * props (`className`, `hitSlop`, `disabled`, `contentContainerStyle`, ...)
 * set on the `TouchableOpacity`/`ScrollView` element in JSX — those live on
 * the composite fiber. Querying by type and filtering on `testID` reaches
 * that composite element instead, so `.props` reflects what was actually
 * authored on the component.
 */
function touchableByTestId(testId: string) {
  const match = screen
    .UNSAFE_getAllByType(TouchableOpacity)
    .find((el) => el.props.testID === testId);
  if (!match) throw new Error(`No TouchableOpacity with testID "${testId}"`);
  return match;
}

function scrollByTestId(testId: string) {
  const match = screen.UNSAFE_getAllByType(ScrollView).find((el) => el.props.testID === testId);
  if (!match) throw new Error(`No ScrollView with testID "${testId}"`);
  return match;
}

async function goToSentBranch(email = 'coach@example.com') {
  fireEvent.changeText(screen.getByPlaceholderText('coach@school.edu'), email);
  mockSignInWithOtp.mockResolvedValueOnce({ error: null });
  fireEvent.press(touchableByTestId('send-magic-link-button'));
  await waitFor(() => expect(screen.getByText('Check your email')).toBeTruthy());
}

describe('SignInScreen — M1: "Use a different email" hit target', () => {
  it('renders with real padding and a hitSlop supplement, not a bare unpadded link', async () => {
    render(<SignInScreen />);
    await goToSentBranch();

    const link = touchableByTestId('use-different-email-button');

    // Padding is the primary fix (matches the file's own idiom — the real
    // buttons express height via `py-*` classes). This only pins that a
    // vertical-padding class is present; NativeWind does not resolve
    // `className` to real styles under Jest (no Metro/CSS build step here),
    // so the actual computed height is not something this test can see.
    expect(link.props.className).toEqual(expect.stringContaining('py-3'));

    // hitSlop is a supplement, not a replacement — asserted for completeness,
    // not as an alternative fix.
    expect(link.props.hitSlop).toEqual({ top: 8, bottom: 8, left: 8, right: 8 });
  });
});

describe('SignInScreen — M5: scroll container', () => {
  it('wraps the initial email-form branch in a ScrollView', () => {
    render(<SignInScreen />);

    const scroll = scrollByTestId('sign-in-scroll-form');
    // flexGrow: 1 on the content container is what preserves centring when
    // content fits while still letting the container grow (and scroll) past
    // the viewport when it doesn't — the crux of the M5 fix.
    expect(scroll.props.contentContainerStyle).toMatchObject({
      flexGrow: 1,
      alignItems: 'center',
      justifyContent: 'center',
    });
    // So a tap on a button while the keyboard is open registers on the first
    // tap instead of only dismissing the keyboard.
    expect(scroll.props.keyboardShouldPersistTaps).toBe('handled');
  });

  it('wraps the "sent" branch in a ScrollView too', async () => {
    render(<SignInScreen />);
    await goToSentBranch();

    const scroll = scrollByTestId('sign-in-scroll-sent');
    expect(scroll.props.contentContainerStyle).toMatchObject({
      flexGrow: 1,
      alignItems: 'center',
      justifyContent: 'center',
    });
    expect(scroll.props.keyboardShouldPersistTaps).toBe('handled');
  });
});

describe('SignInScreen — "Use a different email" behaviour', () => {
  it('returns to the email form and clears both the code and the error', async () => {
    render(<SignInScreen />);
    await goToSentBranch();

    // Put the sent branch into a non-default state: a typed code and a
    // surfaced error.
    fireEvent.changeText(screen.getByPlaceholderText('Enter code'), '1234');
    mockVerifyOtp.mockResolvedValueOnce({ error: { message: 'Invalid code' } });
    fireEvent.press(touchableByTestId('verify-code-button'));
    await waitFor(() => expect(screen.getByText('Invalid code')).toBeTruthy());

    fireEvent.press(touchableByTestId('use-different-email-button'));

    // 1. Back on the email form.
    expect(screen.queryByText('Check your email')).toBeNull();
    expect(screen.getByPlaceholderText('coach@school.edu')).toBeTruthy();

    // 2. Error cleared.
    expect(screen.queryByText('Invalid code')).toBeNull();

    // 3. Code cleared — proven by going forward again and checking the code
    // input comes back empty rather than still holding '1234'.
    mockSignInWithOtp.mockResolvedValueOnce({ error: null });
    fireEvent.press(touchableByTestId('send-magic-link-button'));
    await waitFor(() => expect(screen.getByText('Check your email')).toBeTruthy());
    expect(screen.getByPlaceholderText('Enter code').props.value).toBe('');
  });
});

describe('SignInScreen — submit buttons stay disabled on empty input', () => {
  it('disables "Send magic link" until the email field has content', () => {
    render(<SignInScreen />);

    expect(touchableByTestId('send-magic-link-button').props.disabled).toBe(true);

    fireEvent.changeText(screen.getByPlaceholderText('coach@school.edu'), 'coach@example.com');
    expect(touchableByTestId('send-magic-link-button').props.disabled).toBe(false);
  });

  it('disables "Verify code" until the code field has content', async () => {
    render(<SignInScreen />);
    await goToSentBranch();

    expect(touchableByTestId('verify-code-button').props.disabled).toBe(true);

    fireEvent.changeText(screen.getByPlaceholderText('Enter code'), '1234');
    expect(touchableByTestId('verify-code-button').props.disabled).toBe(false);
  });
});

describe('SignInScreen — email sign-in stays invite-only', () => {
  it('never lets an unknown email self-register', async () => {
    render(<SignInScreen />);
    await goToSentBranch('new@example.com');

    // An account created here could later link a Google identity and skip the
    // invite-only trigger, so account creation must be refused at the source.
    expect(mockSignInWithOtp).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'new@example.com',
        options: expect.objectContaining({ shouldCreateUser: false }),
      }),
    );
  });

  it('shows the not-registered copy when Supabase refuses to create the user', async () => {
    render(<SignInScreen />);
    fireEvent.changeText(screen.getByPlaceholderText('coach@school.edu'), 'new@example.com');
    mockSignInWithOtp.mockResolvedValueOnce({ error: { message: 'Signups not allowed for otp' } });
    fireEvent.press(touchableByTestId('send-magic-link-button'));

    await waitFor(() =>
      expect(
        screen.getByText('This email is not registered on the platform. Contact your coach for an invite.'),
      ).toBeTruthy(),
    );
    expect(screen.queryByText('Check your email')).toBeNull();
  });
});

describe('SignInScreen — Google sign-in', () => {
  const GOOGLE_URL = 'https://project.supabase.co/auth/v1/authorize?provider=google';
  const REDIRECT = 'baseballcoaches://auth-callback';

  beforeEach(() => {
    mockSignInWithOAuth.mockResolvedValue({ data: { url: GOOGLE_URL }, error: null });
  });

  function pressGoogle() {
    fireEvent.press(touchableByTestId('google-sign-in-button'));
  }

  function googleButtonEnabled() {
    return touchableByTestId('google-sign-in-button').props.disabled === false;
  }

  it('exchanges the PKCE code from the redirect for a session', async () => {
    mockOpenAuthSession.mockResolvedValueOnce({ type: 'success', url: `${REDIRECT}?code=pkce-code` });
    mockExchangeCodeForSession.mockResolvedValueOnce({ error: null });
    render(<SignInScreen />);

    pressGoogle();

    await waitFor(() => expect(mockExchangeCodeForSession).toHaveBeenCalledWith('pkce-code'));
    expect(mockSignInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: REDIRECT, skipBrowserRedirect: true },
    });
    expect(mockOpenAuthSession).toHaveBeenCalledWith(GOOGLE_URL, REDIRECT);
    await waitFor(() => expect(googleButtonEnabled()).toBe(true));
  });

  it('does not claim the invite is missing when the signup is rejected', async () => {
    mockOpenAuthSession.mockResolvedValueOnce({
      type: 'success',
      url: `${REDIRECT}?error=server_error&error_description=Database+error+saving+new+user`,
    });
    render(<SignInScreen />);

    pressGoogle();

    await waitFor(() =>
      expect(screen.getByText(/We couldn't sign you in with that Google account/)).toBeTruthy(),
    );
    expect(screen.getByText(/If you haven't been invited yet, contact your coach/)).toBeTruthy();
    expect(mockExchangeCodeForSession).not.toHaveBeenCalled();
    await waitFor(() => expect(googleButtonEnabled()).toBe(true));
  });

  it('uses the generic failure copy for any other OAuth error', async () => {
    mockOpenAuthSession.mockResolvedValueOnce({ type: 'success', url: `${REDIRECT}?error=access_denied` });
    render(<SignInScreen />);

    pressGoogle();

    await waitFor(() => expect(screen.getByText('Google sign-in failed. Please try again.')).toBeTruthy());
    expect(screen.queryByText(/haven't been invited/)).toBeNull();
  });

  it('treats a cancelled browser session as a no-op, not an error', async () => {
    mockOpenAuthSession.mockResolvedValueOnce({ type: 'cancel' });
    render(<SignInScreen />);

    pressGoogle();

    await waitFor(() => expect(mockOpenAuthSession).toHaveBeenCalled());
    await waitFor(() => expect(googleButtonEnabled()).toBe(true));
    expect(screen.queryByText(/Google sign-in failed/)).toBeNull();
    expect(screen.queryByText(/Something went wrong/)).toBeNull();
    expect(mockExchangeCodeForSession).not.toHaveBeenCalled();
  });

  it('surfaces an error when the redirect carries neither a code nor an error', async () => {
    mockOpenAuthSession.mockResolvedValueOnce({ type: 'success', url: REDIRECT });
    render(<SignInScreen />);

    pressGoogle();

    await waitFor(() =>
      expect(screen.getByText('Something went wrong signing in with Google. Please try again.')).toBeTruthy(),
    );
    expect(mockExchangeCodeForSession).not.toHaveBeenCalled();
  });

  it('re-enables the button and shows an error when the browser session rejects', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockOpenAuthSession.mockRejectedValueOnce(new Error('browser unavailable'));
    render(<SignInScreen />);

    pressGoogle();

    await waitFor(() => expect(screen.getByText('Google sign-in failed. Please try again.')).toBeTruthy());
    expect(googleButtonEnabled()).toBe(true);
    consoleError.mockRestore();
  });
});
