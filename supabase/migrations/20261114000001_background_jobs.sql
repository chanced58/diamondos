-- Background jobs: pg_cron schedules and pg_net calls, configured from Vault.
--
-- Configuration lives in Vault (set once by the owner in the SQL editor), never here:
--   job_functions_base_url  https://<project-ref>.supabase.co/functions/v1
--   job_web_base_url        the web app origin
--   job_internal_secret     edge-function secret INTERNAL_JOB_SECRET (header x-internal-secret)
--   job_cron_secret         the web app's CRON_SECRET (Authorization: Bearer)
-- A job whose configuration is missing logs one app_error_log row ('job.config') and skips.
--
-- pg_net is asynchronous: net.http_* only queues the request and returns its id, and
-- responses land in net._http_response (kept about six hours, with no job name). So every
-- call records a public.job_runs row, and the collect-job-runs job copies the outcome back.
--
-- The pitch-count trigger is created disabled; a later migration enables it.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- Job runs ------------------------------------------------------------------
create table if not exists public.job_runs (
  id           bigint generated always as identity primary key,
  job          text not null,
  request_id   bigint,
  requested_at timestamptz not null default now(),
  status_code  int,
  error        text,
  completed_at timestamptz
);

create index if not exists job_runs_job_requested_at_idx
  on public.job_runs (job, requested_at desc);

create index if not exists job_runs_pending_request_idx
  on public.job_runs (request_id)
  where completed_at is null;

alter table public.job_runs enable row level security;
revoke all on public.job_runs from anon, authenticated;
grant select, delete on public.job_runs to service_role;

-- Configuration ---------------------------------------------------------------
create or replace function private.job_config(p_name text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select ds.decrypted_secret
  from vault.decrypted_secrets ds
  where ds.name = p_name
  order by ds.created_at desc
  limit 1;
$$;

-- One HTTP call. Never raises: any failure is logged to app_error_log.
create or replace function private.job_http(
  p_job        text,
  p_method     text,
  p_base_key   text,
  p_path       text,
  p_auth       text,
  p_body       jsonb,
  p_timeout_ms int
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret_name text;
  v_base_url    text;
  v_secret      text;
  v_missing     text[] := array[]::text[];
  v_headers     jsonb;
  v_request_id  bigint;
begin
  begin
    v_secret_name := case p_auth
      when 'internal' then 'job_internal_secret'
      when 'cron' then 'job_cron_secret'
    end;
    if v_secret_name is null then
      raise exception 'Unsupported auth % for job %', p_auth, p_job;
    end if;
    if p_method is null or p_method not in ('GET', 'POST') then
      raise exception 'Unsupported method % for job %', p_method, p_job;
    end if;

    v_base_url := private.job_config(p_base_key);
    v_secret := private.job_config(v_secret_name);
    if v_base_url is null then
      v_missing := v_missing || p_base_key;
    end if;
    if v_secret is null then
      v_missing := v_missing || v_secret_name;
    end if;

    if cardinality(v_missing) > 0 then
      insert into public.app_error_log (source, area, message, details)
      values (
        'db',
        'job.config',
        'Missing Vault secret for job ' || p_job,
        jsonb_build_object('job', p_job, 'missing', to_jsonb(v_missing))
      );
      return;
    end if;

    v_headers := case p_auth
      when 'internal' then jsonb_build_object('x-internal-secret', v_secret)
      else jsonb_build_object('Authorization', 'Bearer ' || v_secret)
    end;

    if p_method = 'POST' then
      v_request_id := net.http_post(
        url := rtrim(v_base_url, '/') || p_path,
        body := coalesce(p_body, '{}'::jsonb),
        params := '{}'::jsonb,
        headers := v_headers || jsonb_build_object('Content-Type', 'application/json'),
        timeout_milliseconds := p_timeout_ms
      );
    else
      v_request_id := net.http_get(
        url := rtrim(v_base_url, '/') || p_path,
        params := '{}'::jsonb,
        headers := v_headers,
        timeout_milliseconds := p_timeout_ms
      );
    end if;

    insert into public.job_runs (job, request_id) values (p_job, v_request_id);
  exception when others then
    insert into public.app_error_log (source, area, message, details)
    values (
      'db',
      'job.' || p_job,
      sqlerrm,
      jsonb_build_object('job', p_job, 'sqlstate', sqlstate, 'method', p_method, 'path', p_path)
    );
  end;
end;
$$;

-- Pitch-count trigger -----------------------------------------------------------
-- Never rejects or delays a play: pg_net only queues, and every error is swallowed
-- after logging.
create or replace function private.notify_pitch_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform private.job_http(
      'pitch-count-calculator',
      'POST',
      'job_functions_base_url',
      '/pitch-count-calculator',
      'internal',
      jsonb_build_object('type', 'INSERT', 'table', 'game_events', 'record', to_jsonb(new)),
      10000
    );
  exception when others then
    begin
      insert into public.app_error_log (source, area, message, details, game_id)
      values ('db', 'job.pitch-count-calculator', sqlerrm,
              jsonb_build_object('sqlstate', sqlstate, 'event_id', new.id), new.game_id);
    exception when others then
      null;
    end;
  end;
  return new;
end;
$$;

drop trigger if exists game_events_notify_pitch_count on public.game_events;
create trigger game_events_notify_pitch_count
  after insert on public.game_events
  for each row
  when (new.event_type = 'pitch_thrown')
  execute function private.notify_pitch_count();
alter table public.game_events disable trigger game_events_notify_pitch_count;

-- Collecting outcomes -----------------------------------------------------------
create or replace function private.collect_job_runs()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  with answered as (
    update public.job_runs jr
    set status_code = r.status_code,
        error = case
          when r.status_code between 200 and 299 then r.error_msg
          else coalesce(r.error_msg, case when r.timed_out then 'timed out' end,
                        'HTTP ' || r.status_code::text, 'unknown failure')
        end,
        completed_at = now()
    from net._http_response r
    where jr.completed_at is null
      and jr.request_id = r.id
    returning jr.id, jr.job, jr.request_id, jr.status_code, jr.error
  ),
  unanswered as (
    update public.job_runs jr
    set error = 'no response',
        completed_at = now()
    where jr.completed_at is null
      and jr.requested_at < now() - interval '10 minutes'
      and not exists (select 1 from net._http_response r where r.id = jr.request_id)
    returning jr.id, jr.job, jr.request_id, jr.status_code, jr.error
  ),
  failed as (
    select * from answered
    where status_code is null or status_code not between 200 and 299
    union all
    select * from unanswered
  )
  insert into public.app_error_log (source, area, message, details)
  select
    'db',
    'job.' || f.job,
    'Job ' || f.job || ' failed: ' || coalesce(f.error, 'HTTP ' || f.status_code::text, 'unknown failure'),
    jsonb_build_object('job', f.job, 'job_run_id', f.id, 'request_id', f.request_id,
                       'status_code', f.status_code, 'error', f.error)
  from failed f
  where f.job <> 'pitch-count-calculator';
end;
$$;

revoke all on all functions in schema private from public, anon, authenticated;

-- Health ------------------------------------------------------------------------
create or replace function public.admin_job_health()
returns table (
  job             text,
  enabled         boolean,
  last_run_at     timestamptz,
  last_status     int,
  last_ok         boolean,
  last_success_at timestamptz,
  calls_24h       int,
  failures_24h    int
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    j.name,
    case
      when j.name = 'pitch-count-calculator' then (
        select t.tgenabled <> 'D'
        from pg_catalog.pg_trigger t
        where t.tgrelid = 'public.game_events'::pg_catalog.regclass
          and t.tgname = 'game_events_notify_pitch_count'
      )
      else (select c.active from cron.job c where c.jobname = j.name)
    end,
    last_run.requested_at,
    last_run.status_code,
    case when last_run.requested_at is not null
      then coalesce(last_run.status_code between 200 and 299, false)
    end,
    (select max(r.requested_at) from public.job_runs r
      where r.job = j.name and r.status_code between 200 and 299),
    (select count(*)::int from public.job_runs r
      where r.job = j.name and r.requested_at > now() - interval '24 hours'),
    (select count(*)::int from public.job_runs r
      where r.job = j.name and r.requested_at > now() - interval '24 hours'
        and r.completed_at is not null
        and (r.status_code is null or r.status_code not between 200 and 299))
  from unnest(array['rebuild-league-snapshots', 'practice-notifications-dispatch',
                    'pitch-count-calculator']) as j(name)
  left join lateral (
    select r.requested_at, r.status_code
    from public.job_runs r
    where r.job = j.name
      and r.completed_at is not null
    order by r.requested_at desc
    limit 1
  ) last_run on true;
$$;

revoke all on function public.admin_job_health() from public, anon, authenticated;
grant execute on function public.admin_job_health() to service_role;

-- Schedules (by name, so re-running updates them) ---------------------------------
select cron.schedule(
  'rebuild-league-snapshots',
  '0 */6 * * *',
  $$select private.job_http('rebuild-league-snapshots','GET','job_web_base_url','/api/cron/rebuild-league-snapshots','cron',null,300000)$$
);
select cron.schedule(
  'practice-notifications-dispatch',
  '*/5 * * * *',
  $$select private.job_http('practice-notifications-dispatch','POST','job_functions_base_url','/practice-notifications-dispatch','internal','{}'::jsonb,30000)$$
);
select cron.schedule(
  'collect-job-runs',
  '*/5 * * * *',
  $$select private.collect_job_runs()$$
);
select cron.schedule(
  'prune-logs',
  '15 9 * * *',
  $$delete from public.app_error_log where occurred_at < now() - interval '30 days'; delete from public.job_runs where requested_at < now() - interval '30 days'$$
);
