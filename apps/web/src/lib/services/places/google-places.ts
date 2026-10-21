import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { COACH_ROLES, type PlaceDetails, type PlacePrediction } from '@baseball/shared';
import { invalidInput, serviceError, serviceOk, type ServiceResult } from '../result';

/**
 * Venue search for the mobile game and event forms, proxied through Google
 * Places API (New) so the key stays on the server. The web forms use Google's
 * browser Maps JavaScript API directly; that key is browser-restricted, so
 * this needs its own server key in `GOOGLE_MAPS_SERVER_API_KEY` (Places API
 * (New) enabled). Without it every call answers `unavailable` and the app
 * falls back to a typed venue.
 *
 * Calls carry the client's session token, so a search and the pick that ends
 * it bill as one Places session.
 */

const PLACES_BASE = 'https://places.googleapis.com/v1';
const MIN_QUERY_LENGTH = 3;
const MAX_PREDICTIONS = 5;

const sessionToken = z.string().trim().min(8).max(100);
const autocompleteInput = z.object({ query: z.string().trim().max(200), sessionToken });
const detailsInput = z.object({ placeId: z.string().trim().min(1).max(500), sessionToken });

type Fetch = typeof fetch;

function serverKey(): string | null {
  return process.env.GOOGLE_MAPS_SERVER_API_KEY?.trim() || null;
}

/**
 * Places calls are billed, so only users who coach (or platform admins) may
 * make them — the only people who schedule games and events.
 */
async function mayUsePlaces(db: SupabaseClient, userId: string): Promise<boolean> {
  const { data: coachRows } = await db
    .from('team_members')
    .select('id')
    .eq('user_id', userId)
    .eq('is_active', true)
    .in('role', [...COACH_ROLES])
    .limit(1);
  if ((coachRows ?? []).length > 0) return true;
  const { data: profile } = await db.from('user_profiles').select('is_platform_admin').eq('id', userId).maybeSingle();
  return profile?.is_platform_admin === true;
}

async function guard(db: SupabaseClient, userId: string): Promise<ServiceResult<string>> {
  const key = serverKey();
  if (!key) return serviceError('unavailable', 'Venue search is not configured.');
  if (!(await mayUsePlaces(db, userId))) return serviceError('forbidden', 'Only coaches can search venues.');
  return { ok: true, data: key };
}

export async function autocompletePlaces(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
  fetchImpl: Fetch = fetch,
): Promise<ServiceResult<{ predictions: PlacePrediction[] }>> {
  const parsed = autocompleteInput.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { query, sessionToken: token } = parsed.data;
  if (query.length < MIN_QUERY_LENGTH) return serviceOk({ predictions: [] });

  const access = await guard(db, actorUserId);
  if (!access.ok) return access;

  try {
    const res = await fetchImpl(`${PLACES_BASE}/places:autocomplete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': access.data },
      body: JSON.stringify({ input: query, sessionToken: token }),
    });
    if (!res.ok) {
      console.error(`[places] autocomplete failed status=${res.status}`, await res.text().catch(() => ''));
      return serviceError('unavailable', 'Venue search is unavailable right now.');
    }
    const body = (await res.json()) as {
      suggestions?: {
        placePrediction?: {
          placeId?: string;
          text?: { text?: string };
          structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } };
        };
      }[];
    };
    const predictions = (body.suggestions ?? [])
      .flatMap(({ placePrediction: p }) => {
        if (!p?.placeId) return [];
        const primaryText = p.structuredFormat?.mainText?.text ?? p.text?.text;
        if (!primaryText) return [];
        return [{ placeId: p.placeId, primaryText, secondaryText: p.structuredFormat?.secondaryText?.text ?? null }];
      })
      .slice(0, MAX_PREDICTIONS);
    return serviceOk({ predictions });
  } catch (err) {
    console.error('[places] autocomplete request failed', err);
    return serviceError('unavailable', 'Venue search is unavailable right now.');
  }
}

export async function getPlaceDetails(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
  fetchImpl: Fetch = fetch,
): Promise<ServiceResult<PlaceDetails>> {
  const parsed = detailsInput.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { placeId, sessionToken: token } = parsed.data;

  const access = await guard(db, actorUserId);
  if (!access.ok) return access;

  try {
    const url = `${PLACES_BASE}/places/${encodeURIComponent(placeId)}?sessionToken=${encodeURIComponent(token)}`;
    const res = await fetchImpl(url, {
      headers: { 'X-Goog-Api-Key': access.data, 'X-Goog-FieldMask': 'id,displayName,formattedAddress,location' },
    });
    if (res.status === 404) return serviceError('not_found', 'Venue not found.');
    if (!res.ok) {
      console.error(`[places] details failed status=${res.status}`, await res.text().catch(() => ''));
      return serviceError('unavailable', 'Venue search is unavailable right now.');
    }
    const body = (await res.json()) as {
      id?: string;
      displayName?: { text?: string };
      formattedAddress?: string;
      location?: { latitude?: number; longitude?: number };
    };
    const { latitude, longitude } = body.location ?? {};
    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      return serviceError('unavailable', 'That venue has no location.');
    }
    return serviceOk({
      placeId: body.id ?? placeId,
      name: body.displayName?.text ?? body.formattedAddress ?? 'Venue',
      address: body.formattedAddress ?? null,
      latitude,
      longitude,
    });
  } catch (err) {
    console.error('[places] details request failed', err);
    return serviceError('unavailable', 'Venue search is unavailable right now.');
  }
}
