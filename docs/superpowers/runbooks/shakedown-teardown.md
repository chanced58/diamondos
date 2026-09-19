# Shakedown Teardown Runbook

How to clean up after scoring a synthetic game against `diamondos-prod`
(`ktxjbjfwrmquohipimjn`) — the only Supabase environment this project uses.

Built and verified 2026-09-19 for iOS phase 3, before any synthetic row existed.

---

## The one rule

**Deletes target a recorded primary key. Never a `LIKE` pattern.**

The `SHAKEDOWN` prefix is for *finding* rows. Ids are for *deleting* them. A pattern
in a `DELETE` against the live database is one typo away from removing a real game.

---

## 1. Pre-flight census

Run before creating any synthetic game:

```sql
select id, team_id, opponent_name, status, created_at
from games
where opponent_name ilike 'SHAKEDOWN%'
order by created_at;
```

**Expected: zero rows.** If anything comes back it is residue from an earlier pass.
Do not delete it silently — report it to the owner and get a decision first.

> Measured 2026-09-19: **one row**, `842151c0-b385-4ae6-adc5-d297aeab3b82`
> ("SHAKEDOWN phase2 - do not use", `in_progress`, 99 events, on the real Huskies
> team). Escalated to the owner rather than removed.

## 2. Pre-existing guest snapshot

Mobile can create guest-only identities offline (`createLocalGuest`). They land in
`players`, which has **no FK to `games`**, so deleting the game does not remove them.

```sql
select id, first_name, last_name, team_id, created_at
from players
where is_guest_only = true
order by created_at desc;
```

> Measured 2026-09-19: **zero rows.** This gives a clean invariant — after a sweep,
> every `is_guest_only = true` row is one the sweep created and is safe to remove.
> Re-run this query before each pass; if it is ever non-empty, record the ids here as
> a do-not-delete list and delete only by id difference.

## 3. Ordered delete

Every foreign key pointing at `games.id` is `ON DELETE CASCADE` — verified against
`information_schema` on 2026-09-19. Thirteen dependent tables clean themselves up:

`catcher_innings`, `game_coach_notes`, `game_events`, `game_lineups`, `game_notes`,
`game_player_notes`, `game_reconciliations` (both `home_game_id` and `away_game_id`),
`game_rsvps`, `opponent_game_lineups`, `opponent_lineup_entries`,
`pitch_count_alerts_sent`, `pitch_counts`.

So the game row alone is sufficient:

```sql
delete from games where id = '<recorded-uuid>';
```

**Two edges do NOT cascade — check them first.**

- `games.paired_game_id` is `ON DELETE SET NULL`. If dual scorekeeper provisioned a
  mirror game, deleting one **leaves the other alive** with a nulled pointer. Check
  and delete both:

  ```sql
  select id, opponent_name, scorer_side, paired_game_id
  from games
  where id = '<recorded-uuid>' or paired_game_id = '<recorded-uuid>';
  ```

- `practices.linked_game_id` is `ON DELETE SET NULL`. A practice linked to the
  synthetic game survives with a nulled link. That leaves no synthetic row behind, but
  it does silently mutate a real practice — check before deleting:

  ```sql
  select id, title, linked_game_id
  from practices
  where linked_game_id = '<recorded-uuid>';
  ```

  If any row comes back, the sweep linked a real practice to a synthetic game. Record
  the original value before deleting so the link can be restored.

## 4. Guest cleanup

By explicit id list only, never by predicate:

```sql
delete from players where id in ('<guest-uuid-1>', '<guest-uuid-2>');
```

Derive that list by diffing the section-2 query against its pre-sweep result.

## 5. Post-teardown verification

```sql
select count(*) as remaining_games from games where opponent_name ilike 'SHAKEDOWN%';
select count(*) as remaining_guests from players where is_guest_only = true;
```

Both must return the pre-sweep values (currently `0` and `0`). This is a hard exit
criterion — the branch does not open a PR while synthetic rows are live in prod.
