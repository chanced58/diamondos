/** @jest-environment jsdom */
import { runInNewContext } from 'node:vm';
import { buildAppearanceBootstrapScript } from '../bootstrap-script';

// The React the App Router actually ships (a canary with hoistable <meta>), not
// the stable react-dom the component tests use. Its hydration adopts a server
// <meta> only when `content` still matches, so a meta the bootstrap script has
// re-colored is skipped and React appends a second one.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const React = require('next/dist/compiled/react');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { hydrateRoot } = require('next/dist/compiled/react-dom');

const h = React.createElement;

const themeColors = (): Array<string | null> =>
  Array.from(document.querySelectorAll('meta[name="theme-color"]')).map((m) =>
    m.getAttribute('content'),
  );

let root: { unmount(): void } | null = null;

afterEach(async () => {
  await React.act(async () => root?.unmount());
  root = null;
});

/** Server `<head>` HTML, then the pre-paint bootstrap (Dark stored), then hydration. */
async function loadAndHydrate(serverHead: string, tree: unknown): Promise<void> {
  document.head.innerHTML = serverHead;
  document.body.innerHTML = '';
  runInNewContext(buildAppearanceBootstrapScript(), {
    document,
    localStorage: { getItem: (k: string) => (k === 'dos_theme' ? 'dark' : null) },
    location: { pathname: '/dashboard' },
    window: {},
  });
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await React.act(async () => {
    root = hydrateRoot(document, tree, { onRecoverableError: () => undefined });
  });
}

describe('theme-color meta across hydration (Dark)', () => {
  const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  afterAll(() => consoleError.mockRestore());

  it('a React-rendered meta is duplicated once the script re-colors it (why React must not render it)', async () => {
    await loadAndHydrate(
      '<meta name="theme-color" content="#1e3a8a">',
      h('html', null, h('head', null, h('meta', { name: 'theme-color', content: '#1e3a8a' })), h('body')),
    );
    expect(themeColors()).toEqual(['#0f1115', '#1e3a8a']);
  });

  it('leaves exactly one meta, the script-created one, after hydration', async () => {
    await loadAndHydrate('', h('html', null, h('head'), h('body')));
    expect(themeColors()).toEqual(['#0f1115']);
  });
});
