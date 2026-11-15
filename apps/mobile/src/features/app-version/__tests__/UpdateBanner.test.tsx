import { Linking } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

const mockRole = jest.fn();
jest.mock('../../../providers/RoleProvider', () => ({ useRole: () => mockRole() }));
let mockAppVersion: string | null = '1.0.0';
jest.mock('../../../lib/app-version', () => ({
  get APP_VERSION() {
    return mockAppVersion;
  },
}));

import { UpdateBanner, resetUpdateBannerDismissalForTests } from '../UpdateBanner';

const COPY = 'This version of DiamondOS is out of date. Update to keep everything working.';
const URL = 'https://testflight.apple.com/join/abc';

function role(minSupportedAppVersion: string | null, appUpdateUrl: string | null = URL) {
  mockRole.mockReturnValue({ minSupportedAppVersion, appUpdateUrl });
}

let openURL: jest.SpyInstance;
beforeEach(() => {
  resetUpdateBannerDismissalForTests();
  mockAppVersion = '1.0.0';
  openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true as never);
});
afterEach(() => jest.restoreAllMocks());

describe('UpdateBanner', () => {
  it('should be hidden when the app version is supported', () => {
    role('1.0.0');
    render(<UpdateBanner />);
    expect(screen.queryByText(COPY)).toBeNull();
  });

  it('should be hidden when the minimum version is unknown', () => {
    role(null);
    render(<UpdateBanner />);
    expect(screen.queryByText(COPY)).toBeNull();
  });

  it('should be hidden when there is no update link', () => {
    role('1.1.0', null);
    render(<UpdateBanner />);
    expect(screen.queryByText(COPY)).toBeNull();
  });

  it('should show the copy when the app is below the minimum', () => {
    role('1.1.0');
    render(<UpdateBanner />);
    expect(screen.getByText(COPY)).toBeTruthy();
  });

  it('should open the update link from Update', () => {
    role('1.1.0');
    render(<UpdateBanner />);
    fireEvent.press(screen.getByText('Update'));
    expect(openURL).toHaveBeenCalledWith(URL);
  });

  it('should fall back to TestFlight when the link cannot be opened', async () => {
    role('1.1.0');
    openURL.mockRejectedValueOnce(new Error('bad url'));
    render(<UpdateBanner />);
    fireEvent.press(screen.getByText('Update'));
    await waitFor(() => expect(openURL).toHaveBeenLastCalledWith('https://testflight.apple.com'));
  });

  it('should stay hidden after Dismiss, including on re-render', () => {
    role('1.1.0');
    const { unmount } = render(<UpdateBanner />);
    fireEvent.press(screen.getByLabelText('Dismiss'));
    expect(screen.queryByText(COPY)).toBeNull();
    unmount();
    render(<UpdateBanner />);
    expect(screen.queryByText(COPY)).toBeNull();
  });
});
