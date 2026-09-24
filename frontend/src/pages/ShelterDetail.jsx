import { useEffect, useState, useCallback } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { shelterApi } from '../api/client';
import { SingleShelterMap, RouteStatus } from '../components/Maps';
import { Loading, ErrorState, Alert } from '../components/Ui';
import { fetchRoute, externalDirectionsUrl, getCurrentPosition } from '../utils/geo';
import {
  formatDistance,
  facilityLabel,
  occupancyPercent,
  titleCase
} from '../utils/format';
import { FACILITY_FALLBACK } from '../utils/constants';

export default function ShelterDetail() {
  const { id } = useParams();
  const [params] = useSearchParams();

  const [shelter, setShelter] = useState(null);
  const [error, setError] = useState(null);
  const [catalogue, setCatalogue] = useState(FACILITY_FALLBACK);
  const [origin, setOrigin] = useState(null);
  const [routeState, setRouteState] = useState(null);

  useEffect(() => {
    const lat = Number(params.get('lat'));
    const lon = Number(params.get('lon'));
    if (Number.isFinite(lat) && Number.isFinite(lon) && lat !== 0) {
      setOrigin({ latitude: lat, longitude: lon });
    }
  }, [params]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const lat = Number(params.get('lat'));
      const lon = Number(params.get('lon'));
      const query =
        Number.isFinite(lat) && Number.isFinite(lon) && lat !== 0
          ? { latitude: lat, longitude: lon }
          : {};
      const data = await shelterApi.get(id, query);
      setShelter(data.shelter);
    } catch (err) {
      setError(err);
    }
  }, [id, params]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    shelterApi
      .referenceData()
      .then((d) => d?.facilities?.length && setCatalogue(d.facilities))
      .catch(() => {});
  }, []);

  const getDirections = async () => {
    setRouteState({ status: 'loading' });
    try {
      let from = origin;
      if (!from) {
        from = await getCurrentPosition();
        setOrigin(from);
      }
      const route = await fetchRoute(from, shelter);
      setRouteState({
        status: 'ok',
        distanceKm: route.distanceKm,
        durationMin: route.durationMin
      });
    } catch (err) {
      setRouteState({ status: 'error', message: err.message });
    }
  };

  if (error) {
    return (
      <div className="container" style={{ maxWidth: 1180, margin: 'auto', padding: '34px 20px 80px' }}>
        <ErrorState error={error} onRetry={load} />
        <div style={{ marginTop: 20 }}>
          <Link className="btn" to="/shelters">
            Back to all shelters
          </Link>
        </div>
      </div>
    );
  }

  if (!shelter) return <Loading label="Loading shelter details" />;

  const pct = occupancyPercent(shelter.currentOccupancy, shelter.totalCapacity);
  const unusable = shelter.status === 'full' || shelter.status === 'closed';

  const pillClass = (st) => {
    if (st === 'available') return 'pill success';
    if (st === 'limited') return 'pill warning';
    return 'pill danger';
  };

  return (
    <div className="container" style={{ maxWidth: 1180, margin: 'auto', padding: '34px 20px 80px' }}>
      <div className="hero" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 20, flexWrap: 'wrap' }}>
        <div>
          <div className="request-meta">
            <span className={pillClass(shelter.status)}>
              {shelter.status === 'available' ? 'Available' : shelter.status === 'limited' ? 'Limited capacity' : 'Full'}
            </span>
            {shelter.isWheelchairAccessible && (
              <span className="pill primary">Wheelchair accessible</span>
            )}
            {!shelter.isActive && <span className="pill neutral">Deactivated</span>}
          </div>
          <h1 style={{ fontSize: 34, lineHeight: 1.15, letterSpacing: '-0.04em', margin: '4px 0 6px' }}>
            {shelter.name}
          </h1>
          <p className="lead" style={{ color: 'var(--muted)', margin: 0 }}>
            {shelter.address}
            {shelter.pincode ? ` — ${shelter.pincode}` : ''}
          </p>
        </div>
        <div className="actions" style={{ display: 'flex', gap: 9 }}>
          <button type="button" className="btn btn-primary" onClick={getDirections}>
            Get directions
          </button>
          {shelter.emergencyPhone && (
            <a className="btn" href={`tel:${shelter.emergencyPhone}`}>
              Call shelter
            </a>
          )}
        </div>
      </div>

      <div className="divider" style={{ height: 1, background: 'var(--border)', margin: '26px 0' }} />

      {unusable && (
        <div style={{ marginBottom: 20 }}>
          <Alert
            tone="warn"
            title={
              shelter.status === 'full'
                ? 'This shelter is at full capacity'
                : 'This shelter is temporarily closed'
            }
          >
            It will not appear in recommendations until capacity becomes available. Submit an emergency request to find active shelters.
          </Alert>
        </div>
      )}

      {routeState && (
        <div style={{ marginBottom: 20 }}>
          <RouteStatus state={routeState} from={origin} to={shelter} />
        </div>
      )}

      <div className="detailgrid">
        <div className="detailmain">
          <div className="card detailcard">
            <h3>Capacity right now</h3>
            <div className="detailstat" style={{ marginTop: 11 }}>
              <div>
                <strong>{shelter.totalCapacity}</strong>
                <small>Total capacity</small>
              </div>
              <div>
                <strong>{shelter.currentOccupancy}</strong>
                <small>Currently sheltering</small>
              </div>
              <div>
                <strong style={{ color: shelter.availableCapacity > 0 ? 'var(--teal)' : 'var(--primary)' }}>
                  {shelter.availableCapacity}
                </strong>
                <small>Spaces available</small>
              </div>
              <div>
                <strong>{shelter.distanceKm != null ? formatDistance(shelter.distanceKm) : '—'}</strong>
                <small>Straight-line distance</small>
              </div>
            </div>

            <div className={`progress-bar-wrap ${pct >= 100 ? 'danger' : pct >= 80 ? 'warn' : ''}`} style={{ marginTop: 14 }}>
              <i style={{ width: `${Math.min(pct, 100)}%` }} />
            </div>
            <span style={{ color: 'var(--muted)', fontSize: 11, display: 'block', marginTop: 4 }}>
              {pct}% occupied. Available capacity is calculated from total capacity minus current occupancy.
            </span>
          </div>

          {shelter.description && (
            <div className="card detailcard">
              <h3>About this shelter</h3>
              <p style={{ color: 'var(--muted)', margin: 0, fontSize: 13.5, lineHeight: 1.5 }}>
                {shelter.description}
              </p>
            </div>
          )}

          <div className="card detailcard">
            <h3>Facilities</h3>
            {shelter.facilities.length === 0 ? (
              <p style={{ color: 'var(--muted)', fontSize: 12 }}>No facilities recorded for this shelter.</p>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 11 }}>
                {shelter.facilities.map((f) => (
                  <span className="facility-chip" key={f}>
                    ✓ {facilityLabel(f, catalogue)}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="card detailcard">
            <h3>Disaster suitability</h3>
            {shelter.disasterSupport.length === 0 ? (
              <p style={{ color: 'var(--muted)', fontSize: 12 }}>No disaster suitability scores recorded.</p>
            ) : (
              <div className="bars" style={{ marginTop: 10 }}>
                {shelter.disasterSupport.map((d) => {
                  const score = d.suitabilityScore != null
                    ? d.suitabilityScore
                    : Math.round(((d.suitabilityLevel ?? 0) * 100));
                  return (
                    <div className="barrow" key={d.disasterCode}>
                      <span>{titleCase(d.disasterCode)}</span>
                      <div className="bar">
                        <i style={{ width: `${score}%` }} />
                      </div>
                      <span>{score}%</span>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="suitability-notice">
              Shelters rated below 30% for a hazard are excluded from recommendations for that disaster type.
            </div>
          </div>
        </div>

        <aside className="detailside">
          <div className="card detailcard">
            <div style={{ height: 215, borderRadius: 9, overflow: 'hidden', position: 'relative' }}>
              <SingleShelterMap origin={origin} shelter={shelter} />
            </div>
            <a
              className="btn"
              style={{ width: '100%', marginTop: 11, textAlign: 'center', display: 'block' }}
              href={externalDirectionsUrl(shelter.latitude, shelter.longitude)}
              target="_blank"
              rel="noreferrer"
            >
              Open in OpenStreetMap
            </a>
          </div>

          <div className="card detailcard">
            <h3>Contact</h3>
            <p style={{ color: 'var(--muted)', fontSize: 11, margin: 0 }}>Coordinator</p>
            <strong style={{ fontSize: 13, display: 'block', marginTop: 2 }}>{shelter.coordinatorName || 'Shelter Supervisor'}</strong>

            <p style={{ color: 'var(--muted)', fontSize: 11, margin: '10px 0 0' }}>Phone</p>
            <a href={`tel:${shelter.phone || ''}`} style={{ color: 'var(--primary)', fontWeight: 600, fontSize: 13, textDecoration: 'none', display: 'block', marginTop: 2 }}>
              {shelter.phone || 'Not provided'}
            </a>

            <p style={{ color: 'var(--muted)', fontSize: 11, margin: '10px 0 0' }}>Emergency line</p>
            <a href={`tel:${shelter.emergencyPhone || '112'}`} style={{ color: 'var(--primary)', fontWeight: 600, fontSize: 13, textDecoration: 'none', display: 'block', marginTop: 2 }}>
              {shelter.emergencyPhone || '112'}
            </a>
          </div>

          <div className="card detailcard">
            <h3>Accessibility</h3>
            <p style={{ color: 'var(--muted)', fontSize: 13, margin: '0 0 6px' }}>
              {shelter.isWheelchairAccessible
                ? 'This shelter is recorded as wheelchair accessible.'
                : 'Wheelchair accessibility is not confirmed for this shelter.'}
            </p>
            {shelter.accessibilityNotes && (
              <p style={{ color: 'var(--muted)', fontSize: 12.5, margin: 0 }}>
                {shelter.accessibilityNotes}
              </p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
