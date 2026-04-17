-- Prerequisite: extend billable_entity_type with 'player' in its own transaction
-- so the next migration can reference it in CHECK constraints and RLS policies.

alter type public.billable_entity_type add value if not exists 'player';
