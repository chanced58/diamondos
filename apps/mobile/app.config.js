// Static config lives in app.json; Expo passes it in as `config`. This file
// only adds the build-time env check (see build-env.js).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { assertBuildEnv } = require('./build-env');

module.exports = ({ config }) => {
  assertBuildEnv(process.env);
  return config;
};
