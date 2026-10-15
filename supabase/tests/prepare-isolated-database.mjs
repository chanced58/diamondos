import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Legacy migrations share a version. Test the exact SQL in chronological
// order without changing any deployed migration's filename or history.
const sourceDirectory = fileURLToPath(new URL('../', import.meta.url));
const destination = process.argv[2];
if (!destination) throw new Error('Usage: node supabase/tests/prepare-isolated-database.mjs <empty test directory>');
const outputDirectory = resolve(destination);
if (existsSync(outputDirectory) && readdirSync(outputDirectory).length > 0) {
  throw new Error('Use an empty directory so existing databases and files remain intact.');
}
const projectDirectory = join(outputDirectory, 'supabase');
const migrationsDirectory = join(projectDirectory, 'migrations');
mkdirSync(migrationsDirectory, { recursive: true });
const config = readFileSync(join(sourceDirectory, 'config.toml'), 'utf8')
  .replace(/^project_id = .*$/m, 'project_id = "diamondos-tournament-tests"');
writeFileSync(join(projectDirectory, 'config.toml'), config);
copyFileSync(join(sourceDirectory, 'seed.sql'), join(projectDirectory, 'seed.sql'));
cpSync(join(sourceDirectory, 'tests', 'database'), join(projectDirectory, 'tests', 'database'), { recursive: true });

let previousVersion = 0n;
const manifest = [];
for (const filename of readdirSync(join(sourceDirectory, 'migrations')).filter((name) => name.endsWith('.sql')).sort()) {
  const match = /^(\d{14})_(.+)$/.exec(filename);
  if (!match) throw new Error(`Unexpected migration filename: ${filename}`);
  const originalVersion = BigInt(match[1]);
  const version = originalVersion > previousVersion ? originalVersion : previousVersion + 1n;
  const localFilename = `${version}_${match[2]}`;
  copyFileSync(join(sourceDirectory, 'migrations', filename), join(migrationsDirectory, localFilename));
  manifest.push({ source: filename, local: localFilename });
  previousVersion = version;
}
writeFileSync(join(outputDirectory, 'migration-manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`Prepared ${manifest.length} unchanged SQL files; ${manifest.filter((entry) => entry.source !== entry.local).length} local version labels adjusted.`);
