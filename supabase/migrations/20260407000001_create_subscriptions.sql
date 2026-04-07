-- Subscription tracking for billing (manual for now, Zoho CRM sync later)

create type public.subscription_tier as enum (
  'free',
  'starter',
  'pro',
  'enterprise'
);

create type public.subscription_status as enum (
  'active',
  'trial',
  'past_due',
  'cancelled',
  'expired'
);

create type public.billable_entity_type as enum (
  'team',
  'league'
);

create table public.subscriptions (
  id                    uuid primary key default gen_random_uuid(),
  entity_type           public.billable_entity_type not null,
  team_id               uuid references public.teams(id) on delete cascade,
  league_id             uuid references public.leagues(id) on delete cascade,
  tier                  public.subscription_tier not null default 'free',
  status                public.subscription_status not null default 'trial',
  billing_contact_name  text,
  billing_contact_email text,
  trial_starts_at       timestamptz,
  trial_ends_at         timestamptz,
  starts_at             timestamptz,
  ends_at               timestamptz,
  monthly_price_cents   integer,
  notes                 text,
  zoho_account_id       text,
  zoho_deal_id          text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint subscriptions_entity_check check (
    (entity_type = 'team' and team_id is not null and league_id is null) or
    (entity_type = 'league' and league_id is not null and team_id is null)
  )
);

-- RLS: platform admin only
alter table public.subscriptions enable row level security;

create policy "platform_admin_manage_subscriptions"
  on public.subscriptions for all
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- Indexes
create index idx_subscriptions_team_id on public.subscriptions(team_id);
create index idx_subscriptions_league_id on public.subscriptions(league_id);
create index idx_subscriptions_status on public.subscriptions(status);

-- Prevent multiple active/trial subscriptions per entity
create unique index idx_subscriptions_team_unique_active
  on public.subscriptions(team_id)
  where team_id is not null and status not in ('cancelled', 'expired');

create unique index idx_subscriptions_league_unique_active
  on public.subscriptions(league_id)
  where league_id is not null and status not in ('cancelled', 'expired');

-- Auto-update updated_at
create or replace function public.set_subscriptions_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_subscriptions_updated_at
  before update on public.subscriptions
  for each row execute function public.set_subscriptions_updated_at();
