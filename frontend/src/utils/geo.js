/**
 * Browser geolocation and routing helpers.
 *
 * Routing note: real road geometry is requested from a public OSRM
 * instance. If that service is unavailable the app reports the failure
 * and offers an external OpenStreetMap directions link. It never draws a
 * straight line and calls it a route.
 */

const OSRM = import.meta.env.VITE_OSRM_URL || 'https://router.project-osrm.org';

export const GEO_ERRORS = {
  1: 'Location permission was denied. Enter your location on the map instead.',
  2: 'Your location is unavailable right now. Pick a point on the map instead.',
  3: 'Finding your location took too long. Pick a point on the map instead.'
};

export function getCurrentPosition({ timeout = 12000 } = {}) {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('This browser does not support location access. Pick a point on the map instead.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          latitude: Number(pos.coords.latitude.toFixed(6)),
          longitude: Number(pos.coords.longitude.toFixed(6)),
          accuracy: pos.coords.accuracy
        }),
      (err) => reject(new Error(GEO_ERRORS[err.code] || 'Could not determine your location.')),
      { enableHighAccuracy: true, timeout, maximumAge: 60000 }
    );
  });
}

/**
 * Fetches a driving route. Resolves with {coordinates, distanceKm, durationMin}
 * on success, or throws — callers must surface the failure rather than
 * substituting a fake path.
 */
export async function fetchRoute(from, to, { signal } = {}) {
  const url =
    `${OSRM}/route/v1/driving/` +
    `${from.longitude},${from.latitude};${to.longitude},${to.latitude}` +
    '?overview=full&geometries=geojson';

  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Routing service returned ${res.status}`);

  const data = await res.json();
  if (data.code !== 'Ok' || !data.routes?.length) {
    throw new Error(data.message || 'No route could be calculated between these points.');
  }

  const route = data.routes[0];
  return {
    // GeoJSON is [lon, lat]; Leaflet expects [lat, lon].
    coordinates: route.geometry.coordinates.map(([lon, lat]) => [lat, lon]),
    distanceKm: route.distance / 1000,
    durationMin: Math.round(route.duration / 60)
  };
}

/** External directions link, used as the fallback when routing fails. */
export function externalDirectionsUrl(from, to) {
  return (
    'https://www.openstreetmap.org/directions?engine=fossgis_osrm_car' +
    `&route=${from.latitude}%2C${from.longitude}%3B${to.latitude}%2C${to.longitude}`
  );
}
