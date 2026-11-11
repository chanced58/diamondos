-- Player Pro, part 1: add the 'player' billable entity in its own transaction so
-- 20261111000001 can use it in a CHECK constraint.
--
-- Replaces 20260417000000, which prod recorded but never applied.

alter type public.billable_entity_type add value if not exists 'player';
