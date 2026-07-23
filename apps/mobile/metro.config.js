const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Watch the entire monorepo including .pnpm virtual store so watchman
// can compute SHA-1 for the real file paths that pnpm symlinks point to.
config.watchFolders = [
  workspaceRoot,
  path.resolve(workspaceRoot, 'node_modules/.pnpm'),
];

// Look for modules in the app's node_modules first, then the workspace root.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Allow Metro to follow pnpm symlinks to the .pnpm virtual store.
// Combined with watchFolders above, watchman sees the real files and
// can provide SHA-1 hashes for them.
config.resolver.unstable_enableSymlinks = true;

// On Windows, Metro encodes backslash path separators as %5C in bundle URLs
// (e.g. ..%5C..%5Cnode_modules%5C.pnpm%5C...) because it resolves through the
// pnpm virtual store using Windows paths. The dev client sends these URLs back
// to Metro which then can't match them. Rewrite %5C → / before routing so Metro
// can serve the files correctly.
config.server = {
  rewriteRequestUrl: (url) => url.replace(/%5[Cc]/g, '/'),
};

module.exports = withNativeWind(config, { input: './global.css' });
