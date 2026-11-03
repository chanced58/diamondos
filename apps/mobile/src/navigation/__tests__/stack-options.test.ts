import { SEMANTIC_TOKENS } from '@baseball/shared';
import { brandStackOptions } from '../stack-options';

describe('brandStackOptions', () => {
  it('should keep the Light brand header identical to the original constant', () => {
    expect(brandStackOptions('light')).toEqual({
      headerStyle: { backgroundColor: '#1e3a8a' },
      headerTintColor: '#ffffff',
      headerTitleStyle: { fontWeight: '700' },
    });
  });

  it('should not add a header shadow override in Light', () => {
    expect(brandStackOptions('light')).not.toHaveProperty('headerShadowVisible');
  });

  it('should use the dark surface and foreground in Dark', () => {
    const options = brandStackOptions('dark') as {
      headerStyle: { backgroundColor: string };
      headerTintColor: string;
      headerShadowVisible: boolean;
    };

    expect(options.headerStyle.backgroundColor).toBe('#181b22');
    expect(options.headerTintColor).toBe(SEMANTIC_TOKENS.dark.fg);
    expect(options.headerShadowVisible).toBe(false);
  });

  it('should use the dugout surface and foreground in Dugout', () => {
    const options = brandStackOptions('dugout') as {
      headerStyle: { backgroundColor: string };
      headerTintColor: string;
      headerShadowVisible: boolean;
    };

    expect(options.headerStyle.backgroundColor).toBe(SEMANTIC_TOKENS.dugout.surface);
    expect(options.headerTintColor).toBe(SEMANTIC_TOKENS.dugout.fg);
    expect(options.headerShadowVisible).toBe(false);
  });

  it('should keep the bold title in every theme', () => {
    for (const theme of ['light', 'dark', 'dugout'] as const) {
      expect(brandStackOptions(theme)).toMatchObject({ headerTitleStyle: { fontWeight: '700' } });
    }
  });
});
