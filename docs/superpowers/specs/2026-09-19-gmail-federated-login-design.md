# Gmail Federated Login — Design

**Date:** 2026-09-19
**Status:** Approved (pending written-spec review)

## Goal

Let coaches, staff, parents, and players sign in with their Google account, in
addition to the existing invite-only magic-link flow. Scope: web (Next.js) and
mobile (Expo).

## Policy

Google sign-in is **invite-only**, matching magic-link's existing behavior:
it only completes for an email that is already known to the platform — either
because it already has an `auth.users` row (any origin: invited staff/parent,
invited player, or an existing Player Pro self-signup account), or because a
`team_invitations` row exists for that email. A Google account with no prior
relationship to the platform cannot create a new account this way.

## Non-goals

- No change to the magic-link flow, RLS policies, or roster/invite logic.
- No "link Google to my account" UI in account settings (YAGNI — sign-in is
  the only entry point for now).
- No Google Workspace domain restriction (`hd` param) — personal Gmail
  accounts are exactly what this is for; a domain restriction wouldn't
  achieve invite-only anyway.

## Architecture

### Enforcement: database trigger, not application code

Supabase's Google provider always creates an `auth.users` row on first login
(no `shouldCreateUser: false` equivalent for OAuth). So invite-only can't be
enforced by preventing the call — only by rejecting the row.

A `BEFORE INSERT ON auth.users` trigger (`enforce_invite_only_signup`)
rejects any new row whose provider is not `'email'` unless a
`team_invitations` row exists for that email:

```sql
create or replace function public.enforce_invite_only_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.raw_app_meta_data->>'provider' = 'email' then
    return new;
  end if;

  if exists (
    select 1 from public.team_invitations where email = lower(new.email)
  ) then
    return new;
  end if;

  raise exception 'signup_requires_invite'
    using errcode = 'P0001';
end;
$$;

create trigger enforce_invite_only_signup
  before insert on auth.users
  for each row
  execute procedure public.enforce_invite_only_signup();
```

This is deliberately centralized in the database rather than duplicated in
web + mobile code, for two reasons:

1. **Correctness at the source.** Supabase's standard behavior for a Google
   sign-in whose email matches an *existing* `auth.users` row is to link the
   Google identity to that user (insert into `auth.identities`, not
   `auth.users`) — so this trigger only ever fires for genuinely new
   signups, and does so before any session is ever issued. An app-level
   post-hoc check (delete the user, sign out) would leave a window where an
   unauthorized session briefly exists, and would need writing twice.
2. **One source of truth.** Web and mobile both get the policy for free by
   handling the error Supabase redirects back with — neither needs to know
   the invite rule itself.

Migration file: `supabase/migrations/20260919000000_enforce_invite_only_oauth_signup.sql`.
Applied to prod (the only environment — see `project_supabase_prod_only`
memory); `packages/database/src/types/supabase.ts` regenerated and
`schema_migrations.version` reconciled afterward per standing convention.

### Web

- [`apps/web/src/app/auth/callback/route.ts`](../../../apps/web/src/app/auth/callback/route.ts):
  handle `?error=` from Supabase (GoTrue's redirect when the trigger raises)
  before falling through to the hash-bridge branch. Maps to
  `/login?error=google_not_invited`.
- [`apps/web/src/app/(auth)/login/page.tsx`](../../../apps/web/src/app/(auth)/login/page.tsx):
  add a `google_not_invited` entry to `ERROR_MESSAGES`.
- [`apps/web/src/components/auth/LoginForm.tsx`](../../../apps/web/src/components/auth/LoginForm.tsx):
  add a "Continue with Google" button calling
  `createBrowserClient().auth.signInWithOAuth({ provider: 'google', options: { redirectTo } })`,
  with `redirectTo` built from the page's existing `next`/`redirectTo` param
  so deep-linked invite acceptance still lands correctly.
- No change to `processInvite` — it resolves team/role from
  `user_metadata` set at invite time, which survives identity linking
  regardless of which provider completes the sign-in.

### Mobile (Expo)

- New deps: `expo-web-browser`, `expo-auth-session`.
- [`apps/mobile/src/providers/AuthProvider.tsx`](../../../apps/mobile/src/providers/AuthProvider.tsx):
  add `signInWithGoogle()` — builds a redirect URI from the app's existing
  `scheme: "baseballcoaches"` (`app.json`), calls `signInWithOAuth` with
  `skipBrowserRedirect: true`, opens the result with
  `WebBrowser.openAuthSessionAsync`, and on success either exchanges the
  returned `code` for a session or surfaces the `error` param as a thrown
  error the sign-in screen displays.
- [`apps/mobile/app/(auth)/sign-in.tsx`](../../../apps/mobile/app/(auth)/sign-in.tsx):
  add the Google button, and an inline error message matching the web copy
  when `signInWithGoogle()` throws.
- Requires `baseballcoaches://auth/callback` on Supabase's Redirect URLs
  allow-list (external setup, alongside the Google Cloud OAuth client).

## Error handling

| Condition | Web | Mobile |
|---|---|---|
| Uninvited Google account | Redirect to `/login?error=google_not_invited` | Inline error, same copy |
| User cancels Google consent | No-op, back on `/login` | `WebBrowser` result `type !== 'success'`, no-op |
| Other GoTrue error | Existing `auth_failed` fallback | Same fallback copy |

Copy: *"That Google account isn't associated with an invite. Contact your
coach, or sign in with the email your invite was sent to."*

`server_error` is GoTrue's generic bucket for any trigger exception during
signup — there's no distinct error code for "rejected by our trigger" vs.
some other Postgres-level failure, so the message is intentionally generic
rather than implying a specific cause.

## External setup (outside the repo)

1. Google Cloud Console: OAuth consent screen + Web OAuth Client ID.
   Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`.
2. Supabase Dashboard → Authentication → Providers → Google: paste
   Client ID/Secret.
3. Supabase Dashboard → Authentication → URL Configuration: confirm the
   Redirect URLs allow-list includes both `/auth/callback` (web) and
   `baseballcoaches://auth/callback` (mobile).

## Testing

- **DB**: verify the trigger rejects a `provider: 'google'` insert for an
  email with no `team_invitations` row, and allows one that has a
  (pending or accepted) row.
- **Web**: manual E2E — (a) invited email via Google → lands on
  `/dashboard` with team membership intact; (b) uninvited email via Google →
  lands on `/login?error=google_not_invited`.
- **Mobile**: same two cases via `WebBrowser.openAuthSessionAsync`, verified
  in the simulator.
