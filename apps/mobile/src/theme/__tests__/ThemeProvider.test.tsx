import { act, render, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import { ThemeProvider, useThemePreference } from '../ThemeProvider';
import * as storage from '../theme-storage';

jest.mock('../theme-storage', () => ({
  loadThemePreference: jest.fn(),
  saveThemePreference: jest.fn(),
}));

const loadThemePreference = storage.loadThemePreference as jest.Mock;
const saveThemePreference = storage.saveThemePreference as jest.Mock;

type Api = ReturnType<typeof useThemePreference>;

function setup(scheme: 'light' | 'dark' | null) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const rn = require('react-native');
  const spy = jest.spyOn(rn, 'useColorScheme').mockReturnValue(scheme);
  const api: { current: Api } = { current: undefined as unknown as Api };

  function Reader() {
    api.current = useThemePreference();
    return <Text>reader</Text>;
  }

  // A fresh element each time, so rerender is not bailed out by React.
  const tree = () => (
    <ThemeProvider>
      <Reader />
    </ThemeProvider>
  );
  const utils = render(tree());
  return {
    api,
    spy,
    rerenderWith(next: 'light' | 'dark' | null) {
      spy.mockReturnValue(next);
      utils.rerender(tree());
    },
  };
}

describe('ThemeProvider', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  beforeEach(() => {
    loadThemePreference.mockReset();
    saveThemePreference.mockReset();
    saveThemePreference.mockResolvedValue(undefined);
  });

  it('should not be ready until storage resolves', async () => {
    let resolveLoad: (p: 'system') => void = () => undefined;
    loadThemePreference.mockReturnValue(new Promise((r) => (resolveLoad = r)));

    const { api } = setup('light');
    expect(api.current.ready).toBe(false);

    await act(async () => {
      resolveLoad('system');
    });
    expect(api.current.ready).toBe(true);
  });

  it('should follow the system scheme live when the preference is system', async () => {
    loadThemePreference.mockResolvedValue('system');
    const { api, rerenderWith } = setup('dark');
    await waitFor(() => expect(api.current.ready).toBe(true));

    expect(api.current.themePreference).toBe('system');
    expect(api.current.resolvedTheme).toBe('dark');

    rerenderWith('light');
    expect(api.current.resolvedTheme).toBe('light');
  });

  it('should treat a null system scheme as light', async () => {
    loadThemePreference.mockResolvedValue('system');
    const { api } = setup(null);
    await waitFor(() => expect(api.current.ready).toBe(true));

    expect(api.current.resolvedTheme).toBe('light');
  });

  it('should keep an explicit light preference when the system is dark', async () => {
    loadThemePreference.mockResolvedValue('light');
    const { api, rerenderWith } = setup('dark');
    await waitFor(() => expect(api.current.ready).toBe(true));

    expect(api.current.resolvedTheme).toBe('light');

    rerenderWith('light');
    rerenderWith('dark');
    expect(api.current.resolvedTheme).toBe('light');
  });

  it('should resolve and persist a newly chosen preference', async () => {
    loadThemePreference.mockResolvedValue('system');
    const { api } = setup('light');
    await waitFor(() => expect(api.current.ready).toBe(true));

    act(() => {
      api.current.setThemePreference('dugout');
    });

    expect(api.current.themePreference).toBe('dugout');
    expect(api.current.resolvedTheme).toBe('dugout');
    expect(saveThemePreference).toHaveBeenCalledWith('dugout');
  });

  it('should not let a late storage load override a choice made before it resolved', async () => {
    let resolveLoad: (p: 'dark') => void = () => undefined;
    loadThemePreference.mockReturnValue(new Promise((r) => (resolveLoad = r)));
    const { api } = setup('light');

    act(() => {
      api.current.setThemePreference('dugout');
    });
    await act(async () => {
      resolveLoad('dark');
    });

    expect(api.current.themePreference).toBe('dugout');
    expect(api.current.ready).toBe(true);
  });
});
