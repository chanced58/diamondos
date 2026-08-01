-- Domain-routing foundation for league public homes.

alter table public.leagues
  add column if not exists custom_domain text,
  add column if not exists custom_domain_verification_token text,
  add column if not exists custom_domain_verified_at timestamptz;

create unique index if not exists leagues_custom_domain_unique
  on public.leagues (lower(custom_domain))
  where custom_domain is not null;

comment on column public.leagues.custom_domain is
  'Verified host name routed to this league public home; platform middleware must only activate it after verification.';
