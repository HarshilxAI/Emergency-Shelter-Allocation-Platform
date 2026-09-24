import { useEffect, useState, useRef, useMemo } from 'react';
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  useMap,
  useMapEvents
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { formatDistance } from '../utils/format';
import { fetchRoute, externalDirectionsUrl } from '../utils/geo';
import { DEFAULT_CENTER } from '../utils/constants';
import { Spinner, Alert } from './Ui';

/* Leaflet's default marker images are resolved relative to the CSS file and
   break under a bundler. Every marker here is a styled DivIcon instead, so
   no image assets are required at all. */

function pin(className, label) {
  return L.divIcon({
    className: '',
    html: `<div class="map-pin ${className}">${label}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -16]
  });
}

const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/** Keeps the viewport in step with the markers as results change. */
function FitBounds({ points, padding = 60 }) {
  const map = useMap();
  useEffect(() => {
    const valid = points.filter(
      (p) => Number.isFinite(p?.[0]) && Number.isFinite(p?.[1])
    );
    if (valid.length === 0) return;
    if (valid.length === 1) {
      map.setView(valid[0], 14);
      return;
    }
    map.fitBounds(L.latLngBounds(valid), { padding: [padding, padding], maxZoom: 15 });
  }, [map, points, padding]);
  return null;
}

/** Invalidates size once mounted — Leaflet mis-measures inside flex/grid. */
function ResizeFix() {
  const map = useMap();
  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 120);
    return () => clearTimeout(t);
  }, [map]);
  return null;
}

/**
 * Draws a real road route from OSRM. On failure it renders nothing on the
 * map and reports the error upward so the UI can offer an external
 * directions link — a straight line is never substituted for a route.
 */
function RouteLayer({ from, to, onState }) {
  const [coords, setCoords] = useState(null);

  useEffect(() => {
    if (!from || !to) return undefined;
    const controller = new AbortController();
    let active = true;

    setCoords(null);
    onState?.({ status: 'loading' });

    fetchRoute(from, to, { signal: controller.signal })
      .then((route) => {
        if (!active) return;
        setCoords(route.coordinates);
        onState?.({
          status: 'ok',
          distanceKm: route.distanceKm,
          durationMin: route.durationMin
        });
      })
      .catch((err) => {
        if (!active || err.name === 'AbortError') return;
        setCoords(null);
        onState?.({ status: 'error', message: err.message });
      });

    return () => {
      active = false;
      controller.abort();
    };
    // onState is intentionally excluded; callers pass a stable callback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from?.latitude, from?.longitude, to?.latitude, to?.longitude]);

  if (!coords) return null;
  return <Polyline positions={coords} pathOptions={{ color: '#E2574A', weight: 5, opacity: 0.85 }} />;
}

/**
 * Main results map: the person's position, ranked shelters, and optionally
 * a route to a selected shelter.
 */
export function ShelterMap({
  origin,
  shelters = [],
  selectedId,
  onSelect,
  routeTo,
  onRouteState,
  height = 'map-frame',
  showLegend = true
}) {
  const center = origin
    ? [origin.latitude, origin.longitude]
    : [DEFAULT_CENTER.latitude, DEFAULT_CENTER.longitude];

  const points = useMemo(() => {
    const list = shelters.map((s) => [s.latitude, s.longitude]);
    if (origin) list.push([origin.latitude, origin.longitude]);
    return list;
  }, [shelters, origin]);

  return (
    <div>
      <div className={height}>
        <MapContainer center={center} zoom={12} scrollWheelZoom>
          <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />
          <ResizeFix />
          <FitBounds points={points} />

          {origin && (
            <Marker position={[origin.latitude, origin.longitude]} icon={pin('map-pin-user', '')}>
              <Popup>
                <strong>Your location</strong>
                <br />
                {origin.label || `${origin.latitude.toFixed(4)}, ${origin.longitude.toFixed(4)}`}
              </Popup>
            </Marker>
          )}

          {shelters.map((s) => (
            <Marker
              key={s.id}
              position={[s.latitude, s.longitude]}
              icon={pin(
                s.rank === 1 ? 'map-pin-top' : 'map-pin-other',
                s.rank != null ? String(s.rank) : ''
              )}
              eventHandlers={{ click: () => onSelect?.(s.id) }}
            >
              <Popup>
                <strong>{s.name}</strong>
                <br />
                {s.distanceKm != null && <>{formatDistance(s.distanceKm)} away · </>}
                {s.availableCapacity} spaces free
                {s.suitabilityScore != null && (
                  <>
                    <br />
                    Suitability {Math.round(s.suitabilityScore)}/100
                  </>
                )}
              </Popup>
            </Marker>
          ))}

          {origin && routeTo && (
            <RouteLayer from={origin} to={routeTo} onState={onRouteState} />
          )}
        </MapContainer>
      </div>

      {showLegend && (
        <div className="map-legend">
          <span>
            <i className="legend-dot" style={{ background: '#1F5FD0' }} /> Your location
          </span>
          <span>
            <i className="legend-dot" style={{ background: '#14795A' }} /> Best match
          </span>
          <span>
            <i className="legend-dot" style={{ background: '#1D2C3B' }} /> Other suitable shelters
          </span>
        </div>
      )}
    </div>
  );
}

/** Single-shelter map, used on the detail page. */
export function SingleShelterMap({ shelter, origin, height = 'map-frame-short' }) {
  const points = useMemo(() => {
    const list = [[shelter.latitude, shelter.longitude]];
    if (origin) list.push([origin.latitude, origin.longitude]);
    return list;
  }, [shelter, origin]);

  return (
    <div className={height}>
      <MapContainer center={[shelter.latitude, shelter.longitude]} zoom={15} scrollWheelZoom={false}>
        <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />
        <ResizeFix />
        <FitBounds points={points} padding={40} />
        <Marker position={[shelter.latitude, shelter.longitude]} icon={pin('map-pin-top', '')}>
          <Popup>
            <strong>{shelter.name}</strong>
            <br />
            {shelter.address}
          </Popup>
        </Marker>
        {origin && (
          <Marker position={[origin.latitude, origin.longitude]} icon={pin('map-pin-user', '')}>
            <Popup>Your location</Popup>
          </Marker>
        )}
      </MapContainer>
    </div>
  );
}

/** Click handler used by the picker below. */
function ClickCapture({ onPick }) {
  useMapEvents({
    click(e) {
      onPick({
        latitude: Number(e.latlng.lat.toFixed(6)),
        longitude: Number(e.latlng.lng.toFixed(6))
      });
    }
  });
  return null;
}

function Recentre({ position }) {
  const map = useMap();
  const last = useRef(null);
  useEffect(() => {
    if (!position) return;
    const key = `${position.latitude},${position.longitude}`;
    if (last.current === key) return;
    last.current = key;
    map.setView([position.latitude, position.longitude], Math.max(map.getZoom(), 14));
  }, [map, position]);
  return null;
}

/**
 * Location picker. The person can either use device geolocation or drop a
 * pin by clicking or dragging — they are never asked to type coordinates.
 */
export function LocationPicker({ value, onChange, busy }) {
  const center = value
    ? [value.latitude, value.longitude]
    : [DEFAULT_CENTER.latitude, DEFAULT_CENTER.longitude];

  return (
    <div>
      <div className="map-frame" style={{ height: 320 }}>
        <MapContainer center={center} zoom={value ? 14 : 11} scrollWheelZoom>
          <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />
          <ResizeFix />
          <ClickCapture onPick={onChange} />
          <Recentre position={value} />
          {value && (
            <Marker
              position={[value.latitude, value.longitude]}
              icon={pin('map-pin-user', '')}
              draggable
              eventHandlers={{
                dragend(e) {
                  const p = e.target.getLatLng();
                  onChange({
                    latitude: Number(p.lat.toFixed(6)),
                    longitude: Number(p.lng.toFixed(6))
                  });
                }
              }}
            />
          )}
        </MapContainer>
      </div>
      <div className="field-hint" style={{ marginTop: 8 }}>
        {value ? (
          <>
            Pin set at {value.latitude.toFixed(5)}, {value.longitude.toFixed(5)}. Click the map or
            drag the pin to adjust.
          </>
        ) : busy ? (
          <span className="row" style={{ gap: 8 }}>
            <Spinner /> Finding your location…
          </span>
        ) : (
          'Click anywhere on the map to drop a pin, or use the location button above.'
        )}
      </div>
    </div>
  );
}

/**
 * Route status strip. Reports honestly what happened: a real route with
 * road distance and time, or a failure plus an external fallback link.
 */
export function RouteStatus({ state, from, to }) {
  if (!state) return null;

  if (state.status === 'loading') {
    return (
      <div className="row small muted" style={{ gap: 8 }}>
        <Spinner /> Calculating road route…
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <Alert tone="warn" title="Route could not be calculated">
        <span>
          {state.message} No route is drawn on the map.{' '}
          {from && to && (
            <a href={externalDirectionsUrl(from, to)} target="_blank" rel="noreferrer">
              Open directions in OpenStreetMap
            </a>
          )}
        </span>
      </Alert>
    );
  }

  return (
    <Alert tone="success" title="Road route found">
      <span>
        {formatDistance(state.distanceKm)} by road, roughly {state.durationMin} minutes driving.
        {from && to && (
          <>
            {' '}
            <a href={externalDirectionsUrl(from, to)} target="_blank" rel="noreferrer">
              Open turn-by-turn directions
            </a>
          </>
        )}
      </span>
    </Alert>
  );
}
