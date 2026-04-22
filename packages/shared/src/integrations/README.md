# Integration adapters

Adapter contract for turning vendor CSV exports (Rapsodo, Blast, HitTrax, Pocket Radar, Diamond Kinetics, GameChanger, …) into rows on `public.training_sessions`.

Tier 5 ships the **contract only**. Concrete vendor adapters land in a later tier; the types in this directory exist so the UI scaffolding, idempotent upsert logic, and edge-function skeletons can be built against a stable shape.

## Flow

```
CSV bytes
  → parseCSV(bytes)                      // vendor-specific, pure
  → normalizeRow(row, ctx)               // player match + shape
  → upsert public.training_sessions      // onConflict: (service, external_session_id)
```

Adapters are **pure** — no network, no DB access — so they can run in the browser for a preview step, in an edge function for server-side ingestion, and in unit tests without mocking.

## Player matching

`normalizeRow` receives an `IntegrationAdapterContext` with `matchPlayer(service, externalId)`. In production this is backed by the `match_player_by_external_id` SQL RPC (see `supabase/migrations/20260422000007_player_external_ids.sql`). Return `null` from `normalizeRow` when the player can't be resolved — the importer surfaces an unmatched-players UI for the coach to reconcile before re-importing.

## Idempotency

Every adapter must populate `externalSessionId` when the vendor exposes one. The partial unique index on `(service, external_session_id) where external_session_id is not null` makes re-importing the same CSV a no-op.

## Implementing a new adapter (future tiers)

1. Define the `TRow` shape as the vendor's CSV columns.
2. Export a concrete `IntegrationAdapter<TRow>` that sets `serviceName` to a stable `TrainingSessionService` value.
3. Write a unit test that pins a sample CSV row to the expected `TrainingSessionInsert` output.
4. Wire the adapter into the upload edge function (not scoped to Tier 5).
