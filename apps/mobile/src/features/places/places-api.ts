import {
  placeAutocompleteResponseSchema,
  placeDetailsSchema,
  type PlaceDetails,
  type PlacePrediction,
} from '@baseball/shared';
import { apiClient, type ApiClient } from '../../lib/api-client';

/**
 * Venue search through the web's Google Places proxy. The session token ties
 * a run of searches to the pick that ends it, so they bill as one session.
 */

export async function searchPlaces(
  query: string,
  sessionToken: string,
  client: ApiClient = apiClient,
  signal?: AbortSignal,
): Promise<PlacePrediction[]> {
  const params = new URLSearchParams({ query, sessionToken });
  const { predictions } = await client.get(`/places/autocomplete?${params}`, placeAutocompleteResponseSchema, signal);
  return predictions;
}

export function getPlace(placeId: string, sessionToken: string, client: ApiClient = apiClient): Promise<PlaceDetails> {
  const params = new URLSearchParams({ sessionToken });
  return client.get(`/places/${encodeURIComponent(placeId)}?${params}`, placeDetailsSchema);
}
