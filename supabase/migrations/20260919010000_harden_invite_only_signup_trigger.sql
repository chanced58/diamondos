-- Harden and correct the invite-only OAuth signup trigger from
-- 20260919000000_enforce_invite_only_oauth_signup.sql, per final review:
--
-- 1. A cancelled invitation (team_invitations.status = 'cancelled') must not
--    continue to authorize account creation — only a pending or accepted
--    invite should. The original trigger matched on email only, regardless
--    of status, so revoking an invite did not revoke the ability to create
--    a Google-signed-in account with that email.
-- 2. Harden search_path to `public, pg_temp` (defends against temp-object
--    shadowing in a security definer function; pg_temp must be listed
--    explicitly and last).
-- 3. Re-create the trigger behind a `drop ... if exists` guard so this
--    migration (and any future replay of it) is idempotent, matching this
--    repo's convention elsewhere.
create or replace function public.enforce_invite_only_signup()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Email/magic-link signups are already invite-gated in application code
  -- (admin.inviteUserByEmail for staff/parents/players, or the Player Pro
  -- self-signup endpoint) — let them through unconditionally.
  if new.raw_app_meta_data->>'provider' = 'email' then
    return new;
  end if;

  -- Only a live (pending or accepted) invitation authorizes a new signup —
  -- a cancelled invite must not. A null new.email never matches and falls
  -- through to the exception below, which is the correct fail-closed
  -- behavior since no other auth method in this app creates a user with a
  -- null email.
  if exists (
    select 1
    from public.team_invitations ti
    where lower(ti.email) = lower(new.email)
      and ti.status in ('pending', 'accepted')
  ) then
    return new;
  end if;

  raise exception 'signup_requires_invite'
    using errcode = 'P0001';
end;
$$;

drop trigger if exists enforce_invite_only_signup on auth.users;

create trigger enforce_invite_only_signup
  before insert on auth.users
  for each row
  execute procedure public.enforce_invite_only_signup();
