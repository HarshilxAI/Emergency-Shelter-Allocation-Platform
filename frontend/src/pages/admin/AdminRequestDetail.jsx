import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { adminApi, shelterApi } from '../../api/client';
import { ShelterMap } from '../../components/Maps';
import ShelterRecord from '../../components/ShelterRecord';
import {
  Loading,
  ErrorState,
  PriorityBadge,
  RequestStatusBadge,
  Spinner,
  EmptyState
} from '../../components/Ui';
import { useToast } from '../../context/ToastContext';
import { formatDateTime, titleCase, facilityLabel } from '../../utils/format';
import { FACILITY_FALLBACK, REQUEST_STATUS } from '../../utils/constants';

export default function AdminRequestDetail() {
  const { id } = useParams();
  const toast = useToast();

  const [request, setRequest] = useState(null);
  const [error, setError] = useState(null);
  const [catalogue, setCatalogue] = useState(FACILITY_FALLBACK);
  const [savingStatus, setSavingStatus] = useState(false);
  const [reassignTarget, setReassignTarget] = useState('');
  const [allocBusy, setAllocBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await adminApi.getRequest(id);
      setRequest(data.request);
      setReassignTarget('');
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

  const changeStatus = async (status) => {
    setSavingStatus(true);
    try {
      const data = await adminApi.updateRequestStatus(id, status);
      setRequest(data.request);
      toast.success(`Request marked ${REQUEST_STATUS[status]?.label.toLowerCase() || status}`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSavingStatus(false);
    }
  };

  /** "Keep allocation" -- endorses the engine's top pick without changing it. */
  const keepAllocation = async () => {
    setAllocBusy(true);
    try {
      const data = await adminApi.confirmAllocation(id, 'Reviewed and kept by admin');
      setRequest(data.request);
      toast.success('Allocation confirmed');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setAllocBusy(false);
    }
  };

  /** "Change shelter" -- overrides the allocation with an admin-chosen shelter. */
  const changeShelter = async () => {
    if (!reassignTarget) return;
    setAllocBusy(true);
    try {
      const data = await adminApi.reassignAllocation(
        id,
        Number(reassignTarget),
        'Reassigned by admin review'
      );
      setRequest(data.request);
      toast.success('Shelter reassigned');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setAllocBusy(false);
    }
  };

  if (error) {
    return (
      <div className="shell page">
        <ErrorState error={error} onRetry={load} />
        <div style={{ marginTop: 20 }}>
          <Link className="btn btn-secondary" to="/admin/requests">
            Back to requests
          </Link>
        </div>
      </div>
    );
  }

  if (!request) return <Loading label="Loading request" />;

  const origin = {
    latitude: request.latitude,
    longitude: request.longitude,
    label: request.locationLabel
  };
  const recommendations = request.recommendations || [];

  return (
    <div className="shell page">
      <div className="page-head">
        <div>
          <div className="row" style={{ gap: 8, marginBottom: 10 }}>
            <PriorityBadge priority={request.priority} />
            <RequestStatusBadge status={request.status} />
            <span className="badge badge-neutral">
              {request.disasterLabel || titleCase(request.disasterCode)}
            </span>
          </div>
          <h1 style={{ fontSize: '1.9rem' }}>Request #{request.id}</h1>
          <p>
            {request.totalPeople} {request.totalPeople === 1 ? 'person' : 'people'} · submitted{' '}
            {formatDateTime(request.createdAt)} by {request.userName}
          </p>
        </div>
        <Link className="btn btn-secondary" to="/admin/requests">
          All requests
        </Link>
      </div>

      <div className="panel" style={{ marginBottom: 28 }}>
        <div className="row-between">
          <div>
            <h3 style={{ fontSize: '1.02rem', marginBottom: 4 }}>Request status</h3>
            <p className="small muted" style={{ margin: 0 }}>
              Mark this fulfilled once the group has reached a shelter.
            </p>
          </div>
          <div className="row" style={{ gap: 8 }}>
            {savingStatus && <Spinner />}
            {Object.entries(REQUEST_STATUS).map(([code, meta]) => (
              <button
                key={code}
                type="button"
                className={`btn btn-sm ${request.status === code ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => changeStatus(code)}
                disabled={savingStatus || request.status === code}
              >
                {meta.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {request.recommendedShelterId && (
        <div className="panel" style={{ marginBottom: 28 }}>
          <div className="row-between" style={{ marginBottom: request.recommendations?.length > 1 ? 16 : 0 }}>
            <div>
              <h3 style={{ fontSize: '1.02rem', marginBottom: 4 }}>Allocation review</h3>
              <p className="small muted" style={{ margin: 0 }}>
                {request.allocationConfirmed
                  ? 'A human reviewer has confirmed this allocation.'
                  : 'Automatically allocated by the engine. Review it below.'}
              </p>
            </div>
            <span className={`badge badge-${request.allocationConfirmed ? 'available' : 'limited'}`}>
              {request.allocationConfirmed ? 'Reviewed' : 'Awaiting review'}
            </span>
          </div>

          {request.recommendations?.length > 1 && (
            <div className="row" style={{ gap: 10 }}>
              <button type="button" className="btn btn-sm btn-primary" onClick={keepAllocation} disabled={allocBusy}>
                {allocBusy && <Spinner light />} Keep allocation
              </button>
              <select
                value={reassignTarget}
                onChange={(e) => setReassignTarget(e.target.value)}
                style={{ width: 'auto', minWidth: 220 }}
                aria-label="Choose a different shelter"
              >
                <option value="">Change shelter to...</option>
                {request.recommendations
                  .filter((r) => r.id !== request.recommendedShelterId)
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} (score {Math.round(r.suitabilityScore)})
                    </option>
                  ))}
              </select>
              <button
                type="button"
                className="btn btn-sm btn-secondary"
                onClick={changeShelter}
                disabled={allocBusy || !reassignTarget}
              >
                Apply change
              </button>
            </div>
          )}
        </div>
      )}

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.6fr)', marginBottom: 28 }}>
        <section className="panel">
          <h3 style={{ marginBottom: 16 }}>Group composition</h3>
          <div className="metrics">
            <div className="metric">
              <div className="metric__value">{request.totalPeople}</div>
              <div className="metric__label">Total people</div>
            </div>
            <div className="metric">
              <div className="metric__value">{request.childrenCount}</div>
              <div className="metric__label">Children</div>
            </div>
            <div className="metric">
              <div className="metric__value">{request.seniorCount}</div>
              <div className="metric__label">Seniors</div>
            </div>
            <div className="metric">
              <div className="metric__value">{request.womenCount}</div>
              <div className="metric__label">Women</div>
            </div>
          </div>

          {request.requiredFacilities?.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <div className="field-label">Facilities requested</div>
              <div className="chips">
                {request.requiredFacilities.map((f) => (
                  <span className="chip" key={f}>
                    {facilityLabel(f, catalogue)}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div style={{ marginTop: 18 }}>
            <div className="field-label">Contact</div>
            <p className="small" style={{ margin: 0 }}>
              {request.userName}
              <br />
              <a href={`mailto:${request.userEmail}`}>{request.userEmail}</a>
            </p>
          </div>

          <div style={{ marginTop: 18 }}>
            <div className="field-label">Reported location</div>
            <p className="small muted" style={{ margin: 0 }}>
              {request.locationLabel || 'No landmark given'}
              <br />
              <span className="num">
                {request.latitude.toFixed(5)}, {request.longitude.toFixed(5)}
              </span>
            </p>
          </div>

          {request.notes && (
            <div style={{ marginTop: 18 }}>
              <div className="field-label">Notes from the requester</div>
              <p className="small muted" style={{ margin: 0 }}>
                {request.notes}
              </p>
            </div>
          )}
        </section>

        <section className="panel panel-flush">
          <ShelterMap
            origin={origin}
            shelters={recommendations}
            height="map-frame"
            showLegend={false}
          />
        </section>
      </div>

      <h2 style={{ fontSize: '1.3rem', marginBottom: 16 }}>
        Shelters recommended at the time of the request
      </h2>

      {recommendations.length === 0 ? (
        <div className="panel">
          <EmptyState title="No shelter could be allocated">
            When this request was submitted, every shelter was full, closed, out of range, or too
            small for the group. This is the case to investigate for capacity gaps.
          </EmptyState>
        </div>
      ) : (
        <div className="stack">
          {recommendations.map((shelter) => (
            <ShelterRecord
              key={shelter.id}
              shelter={shelter}
              requestedFacilities={request.requiredFacilities}
              facilityCatalogue={catalogue}
              originForLink={origin}
            />
          ))}
        </div>
      )}
    </div>
  );
}
