/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
  transformIgnorePatterns: [
    // pnpm nests real packages under node_modules/.pnpm/<name>@<version>/node_modules/<name>,
    // so a plain "node_modules/(?!allow-list)" pattern matches the outer .pnpm segment first
    // and ignores everything regardless of the allow-list. Handle both the .pnpm-relayed path
    // and a conventional flat path.
    'node_modules/\\.pnpm/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?\\+.*|react-navigation|@react-navigation\\+.*|@nozbe\\+watermelondb|@baseball\\+.*))',
    'node_modules/(?!\\.pnpm)(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|react-navigation|@react-navigation/.*|@nozbe/watermelondb|@baseball/.*))',
  ],
};
