-- Invite-only enforcement for non-email auth providers (e.g. Google).
--
-- Supabase's OAuth providers always create a new auth.users row on first
-- login — there is no equivalent of signInWithOtp's `shouldCreateUser: false`
-- for OAuth. This trigger rejects that insert unless the email already has a
-- team_invitations row, so an uninvited Google account can never create a
-- new platform account.
--
-- It does NOT affect linking Google to an *existing* auth.users row (a
-- verified-email match links via auth.identities, which never fires this
-- trigger) — so an already-invited/registered user can always complete
-- Google sign-in and lands on the same account their team membership is on.
create or replace function public.enforce_invite_only_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Email/magic-link signups are already invite-gated in application code
  -- (admin.inviteUserByEmail for staff/parents/players, or the Player Pro
  -- self-signup endpoint) — let them through unconditionally.
  if new.raw_app_meta_data->>'provider' = 'email' then
    return new;
  end if;

  if exists (
    select 1
    from public.team_invitations ti
    where lower(ti.email) = lower(new.email)
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
