'use client';

import { useRef, useState } from 'react';
import { useJsApiLoader, Autocomplete } from '@react-google-maps/api';

const LIBRARIES: ('places')[] = ['places'];

type Props = {
  /** Base name used for the primary visible input and hidden field prefix */
  name: string;
  placeholder?: string;
  defaultValue?: string;
};

/**
 * Wraps Google Places Autocomplete around a styled text input.
 *
 * When the user selects a suggestion, it populates:
 *   - `<name>`            → place short name (visible input value)
 *   - `<name>_address`    → full formatted address
 *   - `<name>_latitude`   → latitude
 *   - `<name>_longitude`  → longitude
 *   - `<name>_place_id`   → Google Place ID
 *
 * All five values are submitted as hidden inputs with the parent form.
 */
export function AddressAutocomplete({ name, placeholder, defaultValue }: Props) {
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '',
    libraries: LIBRARIES,
  });

  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);

  const [displayValue, setDisplayValue] = useState(defaultValue ?? '');
  const [address, setAddress]     = useState('');
  const [latitude, setLatitude]   = useState('');
  const [longitude, setLongitude] = useState('');
  const [placeId, setPlaceId]     = useState('');

  function onPlaceChanged() {
    const place = autocompleteRef.current?.getPlace();
    if (!place) return;

    const loc = place.geometry?.location;
    const shortName = place.name ?? place.formatted_address ?? '';

    setDisplayValue(shortName);
    setAddress(place.formatted_address ?? '');
    setLatitude(loc ? String(loc.lat()) : '');
    setLongitude(loc ? String(loc.lng()) : '');
    setPlaceId(place.place_id ?? '');
  }

  const inputClass =
    'w-full border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 placeholder-gray-400 ' +
    'focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent';

  // Fallback: if the API fails to load, render a plain text input so the form still works
  if (loadError) {
    return (
      <input
        type="text"
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className={inputClass}
      />
    );
  }

  if (!isLoaded) {
    return (
      <input
        type="text"
        disabled
        placeholder="Loading address search..."
        className={`${inputClass} opacity-60 cursor-wait`}
      />
    );
  }

  return (
    <>
      <Autocomplete
        onLoad={(ac) => { autocompleteRef.current = ac; }}
        onPlaceChanged={onPlaceChanged}
      >
        <input
          type="text"
          name={name}
          value={displayValue}
          onChange={(e) => setDisplayValue(e.target.value)}
          placeholder={placeholder}
          className={inputClass}
          autoComplete="off"
        />
      </Autocomplete>

      {/* Hidden inputs carry the structured data through the Server Action form */}
      <input type="hidden" name={`${name}_address`}   value={address} />
      <input type="hidden" name={`${name}_latitude`}  value={latitude} />
      <input type="hidden" name={`${name}_longitude`} value={longitude} />
      <input type="hidden" name={`${name}_place_id`}  value={placeId} />
    </>
  );
}
