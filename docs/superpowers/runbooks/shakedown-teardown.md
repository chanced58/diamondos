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
> a do-not-delete list.
>
> **Do not derive the delete list by diffing this pre-sweep snapshot against a
> post-sweep read of the same query.** Another user (or another concurrent session)
> can create their own guest during the audit window; it wasn't in the pre-sweep
> snapshot either, so a diff would sweep it up too. Instead, record the exact guest
> id(s) at the moment each is created during this sweep (from the app UI or the sync
> log) and delete only that recorded set in step 4 — never a set derived after the
> fact.

## 2b. Pre-existing practice-link snapshot

`practices.linked_game_id` can point at a real practice's game. If the sweep's game
gets linked to an existing practice (e.g. by scoring flows that attach the most
recent game), that practice's *original* `linked_game_id` is only recoverable if it
was recorded **before** the sweep ran. Reading it right before teardown is too late —
by then the column already holds the synthetic game's id, not the original value.

```sql
select id, title, linked_game_id
from practices
where linked_game_id is not null
order by created_at desc;
```

Record this result before creating the synthetic game. Step 3 restores from this
snapshot, not from whatever the column holds at teardown time.

## 3. Ordered delete

Every foreign key from the thirteen dependent tables listed below to `games.id` is
`ON DELETE CASCADE` — verified against `information_schema` on 2026-09-19. (This
does not describe every FK in the schema that references `games.id` — see the two
`SET NULL` edges called out after the list.) Those thirteen clean themselves up:

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

  If any row comes back, the sweep linked a real practice to a synthetic game.
  Restore it from the **step 2b pre-sweep snapshot**, not from a value read here —
  by teardown time this column already holds the synthetic game's id, not the
  practice's original link, so a "record it now" capture cannot recover the
  original:

  ```sql
  update practices set linked_game_id = '<value-from-step-2b-snapshot>'
  where id = '<practice-id>';
  ```

  If step 2b's snapshot doesn't cover this practice (i.e. it was unlinked before
  the sweep), the restored value is `null`.

## 4. Guest cleanup

By explicit id list only, never by predicate, and never by diffing the section-2
snapshot against a post-sweep read (see the note in section 2 — a concurrent
user's own guest would get swept up too):

```sql
delete from players where id in ('<guest-uuid-1>', '<guest-uuid-2>');
```

Use only the id(s) recorded at creation time during this sweep.

## 5. Post-teardown verification

```sql
select count(*) as remaining_games from games where opponent_name ilike 'SHAKEDOWN%';
select count(*) as remaining_guests from players where is_guest_only = true;
```

Both must return the pre-sweep values (currently `0` and `0`). This is a hard exit
criterion — the branch does not open a PR while synthetic rows are live in prod.
