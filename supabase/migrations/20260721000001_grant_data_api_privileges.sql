-- Restores Data API access for anon/authenticated/service_role.
--
-- Newer Supabase CLI versions default `auto_expose_new_tables` to off
-- (matching the current cloud default): tables, views, sequences, and
-- functions in `public` are no longer auto-granted to the Data API roles
-- just because RLS policies exist on them. This project's migrations never
-- added the explicit GRANTs that used to happen implicitly, so every table
-- returns "permission denied" (Postgres error 42501) for anon/authenticated
-- before RLS is ever evaluated. RLS policies remain the actual security
-- boundary — these GRANTs only make the tables reachable at all.
--
-- Applies to all tables/sequences/functions that exist today, and sets
-- default privileges so anything created by future migrations (run as the
-- `postgres` role, same as this one) is automatically exposed without
-- needing a matching GRANT block in every migration going forward.

grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete
  on all tables in schema public
  to anon, authenticated, service_role;

grant usage, select
  on all sequences in schema public
  to anon, authenticated, service_role;

grant execute
  on all functions in schema public
  to anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  grant usage, select on sequences to anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  grant execute on functions to anon, authenticated, service_role;
