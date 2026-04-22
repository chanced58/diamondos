# Tier 5 — Local verification snippets

Quick commands for sanity-checking the new Tier 5 edge functions and tables against a local Supabase stack.

## Prereqs

- Docker running (`supabase start` needs it).
- `supabase db reset` applied (this also runs `supabase/seed.sql`, which creates the `5eed0000-…` test team with 3 practices, 2 games, and an `ics_token_version = 1` row in `team_integrations`).
- `ICS_FEED_SECRET` set to a ≥ 32-char value. For local dev:
  ```bash
  supabase secrets set ICS_FEED_SECRET="local-dev-secret-please-change-me-32chars"
  ```
- `supabase functions serve team-calendar-ics` running (separate terminal).

## Run the pure-function tests

```bash
# From the repo root
deno test --allow-none supabase/functions/_shared/ics.test.ts
deno test --allow-none supabase/functions/maxpreps-export/xml.test.ts
```

Both suites are pure — no DB, no network — so they run without starting Supabase.

## ICS feed

The seeded team ID is `5eed0000-0000-0000-0000-000000000001` at version 1. Compute the token with the same HMAC helper the edge function uses:

```bash
# Python one-liner (requires the same ICS_FEED_SECRET)
python3 -c "
import hmac, hashlib, base64
secret = 'local-dev-secret-please-change-me-32chars'
team = '5eed0000-0000-0000-0000-000000000001'
version = 1
digest = hmac.new(secret.encode(), f'{team}:{version}'.encode(), hashlib.sha256).digest()
print(base64.urlsafe_b64encode(digest).rstrip(b'=').decode())
"
```

Then fetch:

```bash
TOKEN="<output from above>"
curl -i "http://localhost:54321/functions/v1/team-calendar-ics?team=5eed0000-0000-0000-0000-000000000001&token=${TOKEN}"
```

Expect `HTTP/1.1 200`, `Content-Type: text/calendar; charset=utf-8`, body starts with `BEGIN:VCALENDAR`.

Bad token:

```bash
curl -i "http://localhost:54321/functions/v1/team-calendar-ics?team=5eed0000-0000-0000-0000-000000000001&token=deadbeef"
# → 401 Unauthorized
```

Subscribe the URL in Apple Calendar: **File → New Calendar Subscription…** → paste the URL. Three practices and two games should appear in the upcoming window.

## MaxPreps export — TXT (back-compat path, unchanged)

```bash
curl -X POST \
  -H "Authorization: Bearer ${SUPABASE_ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"gameId":"<a-completed-game-uuid>"}' \
  http://localhost:54321/functions/v1/maxpreps-export
```

Response is `text/plain` with the same tab-delimited format as before Tier 5. A snapshot-test against a known-good byte baseline is the safest way to verify back-compat.

## MaxPreps export — single-game XML

```bash
curl -X POST \
  -H "Authorization: Bearer ${SUPABASE_ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"gameId":"<a-completed-game-uuid>","format":"xml"}' \
  http://localhost:54321/functions/v1/maxpreps-export
```

Response is `application/xml` starting with `<?xml version="1.0" encoding="UTF-8"?>` and containing one `<Game>` element.

## MaxPreps export — season batch XML

```bash
curl -X POST \
  -H "Authorization: Bearer ${SUPABASE_ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"seasonId":"<season-uuid>","format":"xml"}' \
  http://localhost:54321/functions/v1/maxpreps-export
```

Response contains one `<Game>` per completed game in the season, in scheduled order.

## MaxPreps export — batch without XML returns 400

```bash
curl -i -X POST \
  -H "Authorization: Bearer ${SUPABASE_ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"seasonId":"<season-uuid>","format":"txt"}' \
  http://localhost:54321/functions/v1/maxpreps-export
# → HTTP/1.1 400, {"error":"Batch export requires format:\"xml\""}
```

## Token rotation

Visit `/teams/<teamId>/admin/integrations` as a head coach. Click **Regenerate URL**. The new URL works; the previous URL now returns 401 from the edge function. (Existing calendar subscribers may still have the old URL cached by their client — they need to re-subscribe.)
