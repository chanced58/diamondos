/**
 * The reconciliation settle-rules migration is applied by hand (no local
 * database in CI), so its rules are pinned here as text: every choice is
 * recorded as an override (home as well as away), the function leaves
 * resolved_at to the service, and only the service role may call it.
 */
import fs from 'fs';
import path from 'path';

const MIGRATION = path.resolve(
  __dirname,
  '../../../../supabase/migrations/20261101000003_reconciliation_settle_rules.sql',
);
const sql = fs.readFileSync(MIGRATION, 'utf8').replace(/--[^\n]*/g, '').replace(/\s+/g, ' ');
const SIGNATURE = 'public.set_reconciliation_override(uuid, text, boolean, uuid)';

describe('reconciliation settle-rules migration', () => {
  const body = /AS \$\$(.*?)\$\$/.exec(sql)?.[1] ?? '';

  it('should replace set_reconciliation_override with the same signature', () => {
    expect(sql).toContain(
      'CREATE OR REPLACE FUNCTION public.set_reconciliation_override( p_reconciliation_id uuid, p_key text, p_use_away boolean, p_resolved_by uuid ) RETURNS void',
    );
  });

  it('should record the choice either way, keeping the home value as a decision', () => {
    expect(body).toContain("jsonb_build_object('key', p_key, 'useAwayValue', p_use_away)");
    expect(body).not.toMatch(/CASE/i);
  });

  it('should leave resolved_at and resolved_by to the service', () => {
    expect(body).not.toMatch(/resolved_at|resolved_by/);
  });

  it('should keep the function callable by the service role only', () => {
    expect(sql).toContain(`REVOKE EXECUTE ON FUNCTION ${SIGNATURE} FROM public, anon, authenticated`);
    expect(sql).toContain(`GRANT EXECUTE ON FUNCTION ${SIGNATURE} TO service_role`);
  });
});
