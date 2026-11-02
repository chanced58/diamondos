import config from '../../../../tailwind.config';

describe('tailwind.config darkMode', () => {
  it('ties `dark:` variants to <html data-theme="dark">, not the OS preference', () => {
    expect(config.darkMode).toEqual(['selector', '[data-theme="dark"]']);
  });
});
