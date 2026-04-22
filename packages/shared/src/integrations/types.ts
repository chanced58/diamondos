/**
 * Tier 5 — Integration Hub adapter contract.
 *
 * Concrete CSV importers (Rapsodo, Blast, HitTrax, Pocket Radar, Diamond
 * Kinetics, GameChanger, …) land in later tiers and each implement this
 * interface. Tier 5 ships the contract only, so the UI and edge-function
 * scaffolding can be built against a stable shape before vendor parsers exist.
 */
import type { TrainingSessionInsert, TrainingSessionService } from '../types/training-session';

/** Context passed into `normalizeRow` so the adapter can resolve a vendor-side
 *  player identifier to a DiamondOS player UUID. Backed by the SQL RPC
 *  `match_player_by_external_id(service, external_id)` in production. */
export interface IntegrationAdapterContext {
  teamId: string;
  /** Resolve `(service, external_id)` → `player_id` or null when unlinked. */
  matchPlayer: (service: TrainingSessionService, externalId: string) => Promise<string | null>;
}

/**
 * Upstream flow (CSV-based integrations):
 *
 *   CSV bytes
 *     → parseCSV(bytes)                  // vendor-specific parser
 *     → normalizeRow(row, ctx)           // player match + shape → insert
 *     → upsert training_sessions         // onConflict: (service, external_session_id)
 *
 * Adapters are pure — no network, no DB — so they can run in the browser for
 * preview, in an edge function for ingestion, and in unit tests.
 */
export interface IntegrationAdapter<TRow> {
  readonly serviceName: TrainingSessionService;
  parseCSV(file: string | Uint8Array): TRow[];
  normalizeRow(
    row: TRow,
    ctx: IntegrationAdapterContext,
  ): Promise<TrainingSessionInsert | null>;
}
