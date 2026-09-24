import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { requestApi, shelterApi } from '../api/client';
import { ShelterMap, RouteStatus } from '../components/Maps';
import ShelterRecord from '../components/ShelterRecord';
import {
  Loading,
  ErrorState,
  EmptyState,
  Alert,
  ConfirmDialog
} from '../components/Ui';
import { formatDateTime, titleCase, facilityLabel } from '../utils/format';
import { FACILITY_FALLBACK } from '../utils/constants';
import { useToast } from '../context/ToastContext';

export default function Results() {
  const { id } = useParams();
  const toast = useToast();

  const [request, setRequest] = useState(null);
  const [error, setError] = useState(null);
  const [catalogue, setCatalogue] = useState(FACILITY_FALLBACK);

  const [selectedId, setSelectedId] = useState(null);
  const [routeTo, setRouteTo] = useState(null);
  const [routeState, setRouteState] = useState(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const mapRef = useRef(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await requestApi.get(id);
      setRequest(data.request);
    } catch (err) {
      setError(err);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    shelterApi
      .referenceData()
      .then((d) => d?.facilities?.length && setCatalogue(d.facilities))
      .catch(() => {});
  }, []);

  const handleRouteState = useCallback((state) => setRouteState(state), []);

  const showRoute = (shelter) => {
    setSelectedId(shelter.id);
    setRouteTo({ latitude: shelter.latitude, longitude: shelter.longitude });
    setRouteState({ status: 'loading' });
    mapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const cancelRequest = async () => {
    setCancelling(true);
    try {
      const data = await requestApi.cancel(id);
      setRequest(data.request);
      toast.success('Request cancelled');
      setConfirmCancel(false);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setCancelling(false);
    }
  };

  if (error) {
    return (
      <div className="container" style={{ maxWidth: 1180, margin: 'auto', padding: '34px 20px 80px' }}>
        <ErrorState error={error} onRetry={load} />
        <div style={{ marginTop: 20 }}>
          <Link className="btn" to="/requests">
            Back to your requests
          </Link>
        </div>
      </div>
    );
  }

  if (!request) return <Loading label="Loading your recommendations" />;

  const origin = {
    latitude: request.latitude,
    longitude: request.longitude,
    label: request.locationLabel
  };
  const recommendations = request.recommendations || [];
  const isOpen = request.status === 'pending' || request.status === 'allocated';

  const priorityPillClass = (p) => {
    const norm = String(p || '').toLowerCase();
    if (norm === 'critical') return 'pill danger';
    if (norm === 'high') return 'pill warning';
    if (norm === 'medium') return 'pill primary';
    return 'pill neutral';
  };

  return (
    <div className="container" style={{ maxWidth: 1180, margin: 'auto', padding: '34px 20px 80px' }}>
      <div className="hero" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 20, flexWrap: 'wrap' }}>
        <div>
          <div className="eyebrow" style={{ textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--primary)', fontSize: 11, fontWeight: 800, marginBottom: 8 }}>
            Request #{request.id} · Ranked results
          </div>
          <h1 style={{ fontSize: 36, lineHeight: 1.1, letterSpacing: '-0.04em', margin: '0 0 8px' }}>
            {recommendations.length > 0
              ? `${recommendations.length} shelter${recommendations.length === 1 ? '' : 's'} can take your group`
              : 'No suitable shelter found'}
          </h1>
          <p className="lead" style={{ color: 'var(--muted)', maxWidth: 680, margin: 0 }}>
            {request.totalPeople} {request.totalPeople === 1 ? 'person' : 'people'} · {request.disasterLabel || titleCase(request.disasterCode)} · {titleCase(request.priority)} priority · submitted {formatDateTime(request.createdAt)}
          </p>
        </div>
        <div className="actions" style={{ display: 'flex', gap: 10 }}>
          {isOpen && (
            <button
              type="button"
              className="btn btn-danger"
              style={{ color: 'var(--red)', borderColor: 'var(--border)' }}
              onClick={() => setConfirmCancel(true)}
            >
              Cancel request
            </button>
          )}
          <Link className="btn btn-primary" to="/request/new">
            New request
          </Link>
        </div>
      </div>

      <div className="divider" style={{ height: 1, background: 'var(--border)', margin: '26px 0' }} />

      {/* Summary card matching REFERENCE_USER_DASHBOARD.html lines 254-257 */}
      <div className="card detailcard" style={{ marginBottom: 20 }}>
        <div className="detailstat">
          <div>
            <strong>{request.totalPeople}</strong>
            <small>Total people</small>
          </div>
          <div>
            <strong>{request.childrenCount}</strong>
            <small>Children</small>
          </div>
          <div>
            <strong>{request.seniorCount}</strong>
            <small>Senior citizens</small>
          </div>
          <div>
            <strong>{request.womenCount}</strong>
            <small>Women</small>
          </div>
        </div>

        {request.requiredFacilities?.length > 0 && (
          <div style={{ marginTop: 15 }}>
            <strong style={{ fontSize: 13 }}>Facilities requested</strong>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {request.requiredFacilities.map((f) => (
                <span className="facility-chip" key={f}>
                  ✓ {facilityLabel(f, catalogue)}
                </span>
              ))}
            </div>
          </div>
        )}

        {request.locationLabel && (
          <p style={{ color: 'var(--muted)', fontSize: 12, margin: '14px 0 0' }}>
            Location for this request: <strong>{request.locationLabel}</strong>
            {request.latitude && request.longitude && (
              <span> ({request.latitude.toFixed(4)}, {request.longitude.toFixed(4)})</span>
            )}
          </p>
        )}
      </div>

      {recommendations.length === 0 ? (
        <div className="card" style={{ padding: 40 }}>
          <EmptyState
            title="No shelter can currently take this group"
            action={
              <Link className="btn btn-primary" to="/request/new">
                Adjust and try again
              </Link>
            }
          >
            Every shelter in range is full, closed, or too small for {request.totalPeople} people.
            Contact emergency services on 112 directly. If your group can split up, submitting
            smaller requests may find space.
          </EmptyState>
        </div>
      ) : (
        <>
          <div ref={mapRef} style={{ marginBottom: 24 }}>
            <ShelterMap
              origin={origin}
              shelters={recommendations}
              selectedId={selectedId}
              onSelect={setSelectedId}
              routeTo={routeTo}
              onRouteState={handleRouteState}
              height="map-frame"
            />
            {routeState && (
              <div style={{ marginTop: 12 }}>
                <RouteStatus state={routeState} from={origin} to={routeTo} />
              </div>
            )}
          </div>

          {request.status === 'cancelled' && (
            <div style={{ marginBottom: 20 }}>
              <Alert tone="warn" title="This request was cancelled">
                The recommendations below are kept as a record of what was offered at the time.
                Shelter availability will have changed since.
              </Alert>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ fontSize: 20, margin: 0 }}>Ranked recommendations</h2>
            <span style={{ color: 'var(--muted)', fontSize: 13 }}>Best match first</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {recommendations.map((shelter) => (
              <ShelterRecord
                key={shelter.id}
                shelter={shelter}
                requestedFacilities={request.requiredFacilities}
                facilityCatalogue={catalogue}
                onShowRoute={showRoute}
                isSelected={selectedId === shelter.id}
                originForLink={origin}
              />
            ))}
          </div>

          <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 24, textAlign: 'center' }}>
            Scores were calculated when this request was submitted. Shelter occupancy changes
            over time — check the shelter detail page for its current status before travelling.
          </p>
        </>
      )}

      {confirmCancel && (
        <ConfirmDialog
          title="Cancel this request?"
          message="The request will be marked cancelled. Its recommendations stay on record, but it will no longer show as active."
          confirmLabel="Cancel request"
          busy={cancelling}
          onConfirm={cancelRequest}
          onCancel={() => setConfirmCancel(false)}
        />
      )}
    </div>
  );
}
