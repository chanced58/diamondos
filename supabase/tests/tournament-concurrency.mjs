import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';

// Run after resetting the isolated project prepared by prepare-isolated-database.mjs.
// Fixtures stay in that disposable database; game_events are never deleted.
const container = 'supabase_db_diamondos-tournament-tests';
function sqlProcess(sql, { open = false, onOutput = () => {} } = {}) {
  const child = spawn('docker', ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-X', '-q', '-A', '-t']);
  let stdout = ''; let stderr = '';
  child.stdout.on('data', (data) => { stdout += data; onOutput(stdout); });
  child.stderr.on('data', (data) => { stderr += data; });
  const finished = new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
  child.stdin.write('\\set VERBOSITY verbose\n' + sql + '\n');
  if (!open) child.stdin.end();
  return { child, finished };
}
async function run(sql) {
  const result = await sqlProcess(sql).finished;
  assert.equal(result.code, 0, result.stderr);
  return result.stdout.trim();
}
const fixture = readFileSync(new URL('./database/tournament-lineup-enforcement.test.sql', import.meta.url), 'utf8');
const boundary = fixture.indexOf('SET LOCAL ROLE authenticated;');
assert.ok(boundary > 0, 'Update the concurrency fixture boundary if the SQL setup changes.');
await run(fixture.slice(0, boundary).replace(/^BEGIN;\s*SELECT plan\(\d+\);\s*/, 'BEGIN;\n') + '\nCOMMIT;');

const gameId = '77000000-0000-4000-8000-000000000001';
const coachId = '71000000-0000-4000-8000-000000000001';
const authorize = `BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub', '${coachId}', true);`;
function insert(id, sequence, player, position, subtype = 'lineup_extension') {
  const payload = subtype === 'lineup_extension'
    ? { substitutionType: subtype, inPlayerId: player, battingOrderPosition: position }
    : { substitutionType: subtype, outPlayerId: player, removedBattingOrderPosition: position };
  return `INSERT INTO public.game_events (id, game_id, sequence_number, event_type, inning, is_top_of_inning, payload, occurred_at, created_by, device_id)
    VALUES ('${id}', '${gameId}', ${sequence}, 'substitution', 1, false, '${JSON.stringify(payload)}', now(), auth.uid(), 'concurrency-test');`;
}
await run(authorize + insert('78000000-0000-4000-8000-000000000020', 2, '74000000-0000-4000-8000-000000000004', 4, 'lineup_contraction') + 'COMMIT;');

let ready;
const locked = new Promise((resolve) => { ready = resolve; });
const first = sqlProcess(authorize + insert('78000000-0000-4000-8000-000000000021', 3, '74000000-0000-4000-8000-000000000011', 11) + "SELECT 'LOCK_HELD';", {
  open: true, onOutput: (output) => { if (output.includes('LOCK_HELD')) ready(); },
});
let second;
try {
  await Promise.race([locked, first.finished.then((result) => { throw new Error(result.stderr || 'First writer exited before taking the game lock.'); })]);
  second = sqlProcess("SET application_name = 'tournament_race_second';" + authorize
    + insert('78000000-0000-4000-8000-000000000022', 3, '74000000-0000-4000-8000-000000000012', 11) + 'COMMIT;');
  let sawWait = false;
  for (let attempt = 0; attempt < 50; attempt++) {
    const waiting = await run("SELECT count(*) FROM pg_stat_activity WHERE application_name = 'tournament_race_second' AND wait_event_type = 'Lock';");
    if (Number(waiting) > 0) { sawWait = true; break; }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.ok(sawWait, 'The second connection must actually wait for the first game-row lock.');
  first.child.stdin.end('COMMIT;\n');
  const [accepted, collided] = await Promise.all([first.finished, second.finished]);
  assert.equal(accepted.code, 0, accepted.stderr);
  assert.notEqual(collided.code, 0);
  assert.match(collided.stderr, /40001/, 'The losing writer must retry against the authoritative sequence.');
} finally {
  if (!first.child.stdin.writableEnded) first.child.stdin.end('ROLLBACK;\n');
}
const retry = await sqlProcess(authorize + insert('78000000-0000-4000-8000-000000000022', 4, '74000000-0000-4000-8000-000000000012', 12) + 'COMMIT;').finished;
assert.notEqual(retry.code, 0);
assert.match(retry.stderr, /23514/);
assert.match(retry.stderr, /10 batter limit/);
const state = JSON.parse(await run(`SELECT json_build_object(
  'activeCount', (public.tournament_lineup_state_before_event('${gameId}', false, 100)->>'activeCount')::integer,
  'eventCount', (SELECT count(*) FROM public.game_events WHERE game_id = '${gameId}'),
  'score', (SELECT json_build_array(home_score, away_score) FROM public.games WHERE id = '${gameId}')
);`));
assert.equal(state.activeCount, 10);
assert.equal(state.eventCount, 3);
assert.deepEqual(state.score, [0, 0]);
console.log('PASS: two concurrent connections serialize the final slot; one extension succeeds, the retry respects the cap, and historical events/scores remain intact.');

await run(`UPDATE public.user_profiles SET tournament_mode_enabled = true WHERE id = '${coachId}';`);
const request = JSON.stringify({ name: 'Concurrent Creation', startDate: '2026-10-20', endDate: '2026-10-22',
  requestId: '79000000-0000-4000-8000-000000000001',
  team: { type: 'existing', teamId: '72000000-0000-4000-8000-000000000001' },
  lineup: { allowExpanded: false, allowMidGameChanges: false } });
const create = `SELECT tournament_id FROM public.create_tournament('${request}'::jsonb);`;
let creationReady;
const created = new Promise((resolve) => { creationReady = resolve; });
const creator = sqlProcess(authorize + create + "SELECT 'CREATION_HELD';", {
  open: true, onOutput: (output) => { if (output.includes('CREATION_HELD')) creationReady(); },
});
try {
  await Promise.race([created, creator.finished.then((result) => { throw new Error(result.stderr || 'Creator exited before holding its transaction.'); })]);
  const duplicate = sqlProcess("SET application_name = 'tournament_creation_second';" + authorize + create + 'COMMIT;');
  let sawWait = false;
  for (let attempt = 0; attempt < 50; attempt++) {
    const waiting = await run("SELECT count(*) FROM pg_stat_activity WHERE application_name = 'tournament_creation_second' AND wait_event_type = 'Lock';");
    if (Number(waiting) > 0) { sawWait = true; break; }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  creator.child.stdin.end('COMMIT;\n');
  const [original, retried] = await Promise.all([creator.finished, duplicate.finished]);
  assert.ok(sawWait, 'The duplicate creation must wait for the original transaction.');
  assert.equal(original.code, 0, original.stderr);
  assert.equal(retried.code, 0, retried.stderr);
  const uuid = /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/g;
  assert.equal(original.stdout.match(uuid).at(-1), retried.stdout.match(uuid).at(-1));
  assert.equal(Number(await run("SELECT count(*) FROM public.tournaments WHERE request_id = '79000000-0000-4000-8000-000000000001';")), 1);
  console.log('PASS: concurrent identical creation requests wait and return the same complete tournament.');
} finally {
  if (!creator.child.stdin.writableEnded) creator.child.stdin.end('ROLLBACK;\n');
}
