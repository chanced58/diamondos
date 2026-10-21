import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { randomUUID } from 'expo-crypto';
import type { PlacePrediction } from '@baseball/shared';
import { isApiError } from '../../lib/api-client';
import { getPlace, searchPlaces } from './places-api';

export interface Venue {
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  placeId: string | null;
}

interface VenueSearchFieldProps {
  value: Venue | null;
  onChange: (venue: Venue | null) => void;
  placeholder?: string;
}

const SEARCH_DELAY_MS = 300;

/** Any failure other than bad input means search can't help right now. */
function searchUnavailable(error: unknown): boolean {
  return !isApiError(error) || !['invalid', 'forbidden'].includes(error.kind);
}

/**
 * A venue: picked from Google Places search (with an address and
 * coordinates, so the game gets the venue's time zone and a map pin), or just
 * typed. When search is unavailable — no server key, offline, Google down —
 * the typed name still saves; it simply has no coordinates.
 */
export function VenueSearchField({ value, onChange, placeholder = 'e.g. Riverside Baseball Complex' }: VenueSearchFieldProps) {
  const [query, setQuery] = useState(value?.name ?? '');
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [searching, setSearching] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [picking, setPicking] = useState(false);
  const sessionToken = useRef(randomUUID());
  // The query a pick just filled in shouldn't trigger another search.
  const skipSearchFor = useRef<string | null>(value?.name ?? null);

  useEffect(() => {
    const trimmed = query.trim();
    if (unavailable || trimmed.length < 3 || skipSearchFor.current === query) {
      setPredictions([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setSearching(true);
      searchPlaces(trimmed, sessionToken.current, undefined, controller.signal)
        .then(setPredictions)
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          setPredictions([]);
          if (searchUnavailable(error)) setUnavailable(true);
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearching(false);
        });
    }, SEARCH_DELAY_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, unavailable]);

  const type = (text: string) => {
    skipSearchFor.current = null;
    setQuery(text);
    // Typing replaces any picked place: a typed venue has no coordinates.
    onChange(text.trim() ? { name: text, address: null, latitude: null, longitude: null, placeId: null } : null);
  };

  const pick = async (prediction: PlacePrediction) => {
    setPicking(true);
    try {
      const place = await getPlace(prediction.placeId, sessionToken.current);
      skipSearchFor.current = place.name;
      setQuery(place.name);
      setPredictions([]);
      onChange({ name: place.name, address: place.address, latitude: place.latitude, longitude: place.longitude, placeId: place.placeId });
    } catch (error) {
      // Keep the suggestion's name as a typed venue rather than losing it.
      skipSearchFor.current = prediction.primaryText;
      setQuery(prediction.primaryText);
      setPredictions([]);
      onChange({ name: prediction.primaryText, address: prediction.secondaryText, latitude: null, longitude: null, placeId: null });
      if (searchUnavailable(error)) setUnavailable(true);
    } finally {
      setPicking(false);
      // A pick ends the billed session; the next search starts a new one.
      sessionToken.current = randomUUID();
    }
  };

  const hasCoordinates = value?.latitude != null && value?.longitude != null;

  return (
    <View>
      <View className="flex-row items-center border border-gray-300 rounded-lg bg-white px-3">
        <TextInput
          accessibilityLabel="Venue"
          className="flex-1 py-2.5 text-base text-gray-900"
          placeholder={placeholder}
          placeholderTextColor="#9ca3af"
          value={query}
          onChangeText={type}
          autoCorrect={false}
        />
        {(searching || picking) && <ActivityIndicator size="small" />}
        {query.length > 0 && !searching && !picking && (
          <TouchableOpacity accessibilityLabel="Clear venue" onPress={() => type('')} hitSlop={8}>
            <Text className="text-gray-400 text-lg">×</Text>
          </TouchableOpacity>
        )}
      </View>

      {predictions.length > 0 && (
        <View className="mt-1 border border-gray-200 rounded-lg bg-white">
          {predictions.map((prediction) => (
            <TouchableOpacity
              key={prediction.placeId}
              accessibilityRole="button"
              accessibilityLabel={`Use ${prediction.primaryText}`}
              onPress={() => void pick(prediction)}
              className="px-3 py-2.5 border-b border-gray-100"
            >
              <Text className="text-sm font-medium text-gray-900">{prediction.primaryText}</Text>
              {prediction.secondaryText && <Text className="text-xs text-gray-500">{prediction.secondaryText}</Text>}
            </TouchableOpacity>
          ))}
        </View>
      )}

      {hasCoordinates && value?.address ? (
        <Text className="text-xs text-gray-500 mt-1">📍 {value.address}</Text>
      ) : unavailable ? (
        <Text className="text-xs text-gray-500 mt-1">Venue search is unavailable; the name you type is saved as-is.</Text>
      ) : null}
    </View>
  );
}
