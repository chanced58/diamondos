/**
 * The league-game RLS migration is applied by hand (no local database in CI),
 * so its placeholder rules are pinned here as text: scorers may create and
 * edit only unmatched placeholders, never link, fill-in or delete them, and
 * the SECURITY DEFINER helpers are not callable by anon.
 */
import fs from 'fs';
import path from 'path';

const MIGRATION = path.resolve(__dirname, '../../../../supabase/migrations/20261101000002_league_game_rls.sql');
const sql = fs.readFileSync(MIGRATION, 'utf8').replace(/--[^\n]*/g, '');

/** Every `create policy` statement on a table, keyed by command. */
function policiesOn(table: string): { name: string; command: string; body: string }[] {
  const statements = sql.split(';').map((s) => s.trim()).filter((s) => s.startsWith('create policy'));
  return statements
    .filter((s) => s.includes(`on public.${table} `) || s.includes(`on public.${table}\n`))
    .map((s) => ({
      name: /create policy "([^"]+)"/.exec(s)?.[1] ?? '',
      command: /\bfor (all|select|insert|update|delete)\b/.exec(s)?.[1] ?? '',
      body: s.replace(/\s+/g, ' '),
    }));
}

const UNMATCHED = ['placeholder_game_id is not null', 'linked_player_id is null', 'is_fill_in = false'];

describe('league game RLS on placeholders', () => {
  const placeholderPolicies = policiesOn('opponent_players').filter((p) => p.body.includes('can_manage_league_placeholder'));

  it('should have separate select, insert and update policies and no catch-all or delete', () => {
    expect(placeholderPolicies.map((p) => p.command).sort()).toEqual(['insert', 'select', 'update']);
    expect(policiesOn('opponent_players').some((p) => p.command === 'all' || p.command === 'delete')).toBe(false);
  });

  it('should hold the row to unmatched, not a fill-in, both before and after a write', () => {
    for (const policy of placeholderPolicies) {
      const clauses = [/using \((.*?)\)(?: with check|$)/.exec(policy.body)?.[1], /with check \((.*)\)$/.exec(policy.body)?.[1]];
      const present = clauses.filter((clause): clause is string => clause !== undefined);
      expect(present.length).toBe(policy.command === 'update' ? 2 : 1);
      for (const clause of present) {
        for (const condition of UNMATCHED) expect(clause).toContain(condition);
      }
    }
  });

  it('should keep the SECURITY DEFINER helpers away from anon', () => {
    for (const helper of [
      'is_league_game_row(uuid)',
      'league_game_staff(uuid, uuid)',
      'league_home_game_staff(uuid, uuid)',
      'can_manage_league_placeholder(uuid, uuid, uuid)',
    ]) {
      expect(sql).toContain(`revoke execute on function public.${helper} from public, anon;`);
      expect(sql).toContain(`grant execute on function public.${helper} to authenticated, service_role;`);
    }
  });
});
