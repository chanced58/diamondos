BEGIN;
SELECT plan(4);

SELECT has_table('public', 'app_error_log', 'app_error_log exists');

INSERT INTO public.app_error_log (source, area, message) VALUES ('web', 'test', 'service-role row');

SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT count(*) FROM public.app_error_log$$,
  '42501',
  NULL,
  'authenticated cannot read the error log'
);
SELECT throws_ok(
  $$INSERT INTO public.app_error_log (source, area, message) VALUES ('web', 'test', 'nope')$$,
  '42501',
  NULL,
  'authenticated cannot write the error log'
);
RESET ROLE;

SELECT throws_ok(
  $$INSERT INTO public.app_error_log (source, area, message) VALUES ('nope', 'test', 'bad source')$$,
  '23514',
  NULL,
  'source must be one of the known values'
);

SELECT * FROM finish();
ROLLBACK;
