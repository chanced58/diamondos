-- Reject game_events with an occurred_at more than 24 hours ahead of the
-- server's current time. Protects against a scorekeeper's device clock
-- being wildly wrong — without this guard the canonical event timestamp
-- is whatever the client sent, and there is no other server-side
-- validation of occurred_at. 24 hours is lenient enough that reasonable
-- clock skew (hours) does not block normal scoring but tight enough to
-- catch an obviously-broken clock (e.g. year in the future).
--
-- Scorekeeping audit P2 #17.
--
-- Clients rely on the error's shape (`isEventClockAheadRejection` and
-- `serverNowFromClockRejection` in @baseball/shared): SQLSTATE P0001, HINT
-- 'device_clock_ahead', and DETAIL = the server's now() in epoch ms. Mobile
-- uses DETAIL to set aside exactly the refused rows of a bulk push, keeps
-- them on the device and retries them each sync; it never drops them. Keep
-- the 24h interval in step with MAX_EVENT_CLOCK_AHEAD_MS.

create or replace function public.game_events_occurred_at_sanity()
returns trigger
language plpgsql
as $$
begin
  if new.occurred_at > now() + interval '24 hours' then
    raise exception
      'game_events.occurred_at (%) is more than 24h ahead of server now (%); check device clock',
      new.occurred_at, now()
      using errcode = 'P0001',
            hint = 'device_clock_ahead',
            detail = (floor(extract(epoch from now()) * 1000))::bigint::text;
  end if;
  return new;
end;
$$;

drop trigger if exists game_events_occurred_at_sanity_trigger on public.game_events;

create trigger game_events_occurred_at_sanity_trigger
  before insert on public.game_events
  for each row
  execute function public.game_events_occurred_at_sanity();

comment on function public.game_events_occurred_at_sanity() is
  'Reject game_events whose occurred_at is > 24h in the future. Scorekeeping audit P2 #17.';
