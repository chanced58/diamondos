import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import { ThemeProvider } from '../../../../src/theme/ThemeProvider';
import AppearanceScreen from '../appearance';

const getItemAsync = SecureStore.getItemAsync as jest.Mock;
const setItemAsync = SecureStore.setItemAsync as jest.Mock;

function renderScreen() {
  return render(
    <ThemeProvider>
      <AppearanceScreen />
    </ThemeProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  getItemAsync.mockResolvedValue(null);
});

describe('Appearance screen', () => {
  it('shows the four options with the stored one selected', async () => {
    getItemAsync.mockResolvedValue('dugout');
    renderScreen();

    for (const label of ['System', 'Light', 'Dark', 'Dugout']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: 'Dugout' }).props.accessibilityState.selected).toBe(true),
    );
    expect(screen.getByRole('tab', { name: 'System' }).props.accessibilityState.selected).toBe(false);
  });

  it('selects System by default and explains it', async () => {
    renderScreen();
    await waitFor(() => expect(getItemAsync).toHaveBeenCalledWith('dos_theme'));
    expect(screen.getByRole('tab', { name: 'System' }).props.accessibilityState.selected).toBe(true);
    expect(screen.getByText("System follows your phone's light or dark setting.")).toBeTruthy();
  });

  it('persists the choice when Dark is pressed', async () => {
    renderScreen();
    await waitFor(() => expect(getItemAsync).toHaveBeenCalled());
    fireEvent.press(screen.getByText('Dark'));
    await waitFor(() => expect(setItemAsync).toHaveBeenCalledWith('dos_theme', 'dark'));
  });
});
