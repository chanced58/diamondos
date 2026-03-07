import type { JSX } from 'react';
'use client';

import { useJsApiLoader, GoogleMap, Marker } from '@react-google-maps/api';

const LIBRARIES: ('places')[] = ['places'];

type Props = {
  latitude: number;
  longitude: number;
  label: string;
  placeId?: string;
};

/**
 * Renders an embedded Google Map with a single marker and a "Get Directions" link.
 * Renders nothing if latitude/longitude are not provided.
 */
export function LocationMap({ latitude, longitude, label, placeId }: Props): JSX.Element | null {
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '',
    libraries: LIBRARIES,
  });

  const center = { lat: latitude, lng: longitude };

  const directionsUrl = placeId
    ? `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}&destination_place_id=${placeId}`
    : `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;

  if (loadError) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <p className="text-sm text-gray-500">{label}</p>
        <a
          href={directionsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-brand-700 hover:underline mt-1 inline-block"
        >
          Get Directions →
        </a>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Map embed */}
      {isLoaded ? (
        <GoogleMap
          mapContainerStyle={{ width: '100%', height: '280px' }}
          center={center}
          zoom={15}
          options={{
            disableDefaultUI: false,
            zoomControl: true,
            streetViewControl: false,
            mapTypeControl: false,
            fullscreenControl: true,
          }}
        >
          <Marker position={center} title={label} />
        </GoogleMap>
      ) : (
        <div className="w-full h-[280px] bg-gray-100 flex items-center justify-center">
          <p className="text-sm text-gray-400">Loading map...</p>
        </div>
      )}

      {/* Footer with label and directions link */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
        <p className="text-sm text-gray-700 truncate">{label}</p>
        <a
          href={directionsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 ml-4 text-sm font-medium text-brand-700 hover:text-brand-800 hover:underline transition-colors"
        >
          Get Directions →
        </a>
      </div>
    </div>
  );
}
