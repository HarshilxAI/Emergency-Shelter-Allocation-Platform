import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { adminApi } from '../../api/client';
import { Loading, ErrorState, EmptyState, Spinner } from '../../components/Ui';
import { formatRelative, titleCase } from '../../utils/format';
import { useToast } from '../../context/ToastContext';

export default function AdminAllocations() {
  const navigate = useNavigate();
  const toast = useToast();
  const [requests, setRequests] = useState(null);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');
  const [selectedAllocation, setSelectedAllocation] = useState(null);
  const [modalBusy, setModalBusy] = useState(false);
  const [reassignTarget, setReassignTarget] = useState('');
  const [showChangePicker, setShowChangePicker] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await adminApi.listRequests({ limit: 200, status: 'allocated' });
      setRequests(data.requests);
    } catch (err) {
      setError(err);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const pending = (requests || []).filter((r) => !r.allocationConfirmed);
  const confirmed = (requests || []).filter((r) => r.allocationConfirmed);
  const visible =
    requests === null
      ? []
      : filter === 'pending'
      ? pending
      : filter === 'confirmed'
      ? confirmed
      : requests;

  const openReviewModal = async (req) => {
    setModalBusy(true);
    setShowChangePicker(false);
    setReassignTarget('');
    try {
      const detailed = await adminApi.getRequest(req.id);
      setSelectedAllocation(detailed.request);
    } catch {
      setSelectedAllocation(req);
    } finally {
      setModalBusy(false);
    }
  };

  const closeReviewModal = () => {
    setSelectedAllocation(null);
    setShowChangePicker(false);
    setReassignTarget('');
  };

  const handleKeepAllocation = async () => {
    if (!selectedAllocation) return;
    setModalBusy(true);
    try {
      const updated = await adminApi.confirmAllocation(
        selectedAllocation.id,
        'Reviewed and confirmed by administrator'
      );
      toast.success(`Shelter confirmed for Request #${selectedAllocation.id}`);
      setSelectedAllocation(updated.request);
      setRequests((list) =>
        list.map((r) => (r.id === updated.request.id ? { ...r, allocationConfirmed: true } : r))
      );
    } catch (err) {
      toast.error(err.message);
    } finally {
      setModalBusy(false);
    }
  };

  const handleChangeShelter = async () => {
    if (!selectedAllocation || !reassignTarget) return;
    setModalBusy(true);
    try {
      const updated = await adminApi.reassignAllocation(
        selectedAllocation.id,
        Number(reassignTarget),
        'Reassigned by administrator'
      );
      toast.success(`Shelter reassigned for Request #${selectedAllocation.id}`);
      setSelectedAllocation(updated.request);
      setShowChangePicker(false);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setModalBusy(false);
    }
  };

  const priorityBadgeClass = (p) => {
    const pr = String(p || '').toLowerCase();
    if (pr === 'critical') return 'status-badge critical';
    if (pr === 'high') return 'status-badge high';
    if (pr === 'medium') return 'status-badge medium';
    return 'status-badge low';
  };

  return (
    <div className="container" style={{ maxWidth: 1240, margin: 'auto', padding: '34px 20px 80px' }}>
      <div className="hero" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 20, flexWrap: 'wrap', marginBottom: 22 }}>
        <div>
          <div className="eyebrow" style={{ textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--primary)', fontSize: 11, fontWeight: 800, marginBottom: 8 }}>
            Allocation control
          </div>
          <h1 style={{ fontSize: 36, lineHeight: 1.1, letterSpacing: '-0.04em', margin: '0 0 8px' }}>
            Allocations
          </h1>
          <p className="lead" style={{ color: 'var(--muted)', maxWidth: 760, margin: 0 }}>
            Review current shelter assignments and confirm or change allocations.
          </p>
        </div>
        <button
          type="button"
          className="btn"
          onClick={() => {
            const first = pending[0];
            if (first) {
              openReviewModal(first);
            } else {
              setFilter('pending');
            }
          }}
        >
          View pending request
        </button>
      </div>

      {error && <ErrorState error={error} onRetry={load} />}

      {requests === null && !error ? (
        <div style={{ padding: 40 }}>
          <Loading label="Loading allocations" />
        </div>
      ) : (
        <>
          <div className="grid3" style={{ marginBottom: 20 }}>
            <div className="metric-card">
              <div className="value">{requests.length}</div>
              <div className="label">Active allocations</div>
              <div className="note">Groups currently assigned</div>
            </div>
            <div className="metric-card warn">
              <div className="value">{pending.length}</div>
              <div className="label">Awaiting review</div>
              <div className="note">Requests requiring admin check</div>
            </div>
            <div className="metric-card green">
              <div className="value">
                {requests.length > 0
                  ? `${Math.round((confirmed.length / requests.length) * 100)}%`
                  : '100%'}
              </div>
              <div className="label">Confirmed allocations</div>
              <div className="note">{confirmed.length} verified by admin</div>
            </div>
          </div>

          <div className="toolbar" style={{ marginTop: 16 }}>
            {[
              ['all', 'All allocations'],
              ['pending', 'Awaiting review'],
              ['confirmed', 'Confirmed']
            ].map(([code, label]) => (
              <button
                key={code}
                type="button"
                className={`btn btn-sm ${filter === code ? 'btn-primary' : ''}`}
                onClick={() => setFilter(code)}
                style={{ padding: '7px 14px', fontSize: 13 }}
              >
                {label}
              </button>
            ))}
          </div>

          {visible.length === 0 ? (
            <div className="card" style={{ padding: 40 }}>
              <EmptyState title="No allocations found">
                {filter === 'pending'
                  ? 'No allocations are currently waiting on administrator review.'
                  : 'No matching allocations in this view.'}
              </EmptyState>
            </div>
          ) : (
            <div className="tablecard">
              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Request</th>
                      <th>Group</th>
                      <th>Shelter</th>
                      <th>Priority</th>
                      <th>Status</th>
                      <th>Allocated</th>
                      <th style={{ textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((r) => (
                      <tr key={r.id}>
                        <td>
                          <strong>#{r.id}</strong>
                          <div style={{ color: 'var(--muted)', fontSize: 11 }}>
                            {r.disasterLabel || titleCase(r.disasterCode)}
                          </div>
                        </td>
                        <td>{r.totalPeople} people</td>
                        <td>
                          <div style={{ fontWeight: 600 }}>
                            {r.recommendedShelterName || 'None assigned'}
                          </div>
                        </td>
                        <td>
                          <span className={priorityBadgeClass(r.priority)}>
                            {titleCase(r.priority)}
                          </span>
                        </td>
                        <td>
                          <span className={`status-badge ${r.allocationConfirmed ? 'available' : 'pending'}`}>
                            {r.allocationConfirmed ? 'Confirmed' : 'Awaiting review'}
                          </span>
                        </td>
                        <td style={{ color: 'var(--muted)', fontSize: 12 }}>
                          {formatRelative(r.createdAt)}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button
                            type="button"
                            className="btn btn-sm"
                            onClick={() => openReviewModal(r)}
                            style={{ padding: '5px 12px', fontSize: 12 }}
                          >
                            Review
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Review modal matching REFERENCE_ADMIN_DASHBOARD.html lines 256-272 */}
      {selectedAllocation && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeReviewModal(); }}>
          <div className="modal-dialog">
            <div className="modal-dialog-head">
              <div>
                <h2>Allocation review — Request #{selectedAllocation.id}</h2>
                <p>
                  {titleCase(selectedAllocation.priority)} priority · Current allocation
                </p>
              </div>
              <button type="button" className="modal-close-btn" onClick={closeReviewModal}>
                ×
              </button>
            </div>

            <div className="modal-dialog-body">
              <div className="modal-block">
                <h3>Current allocation</h3>
                <div className="admin-detail-grid3">
                  <div className="admin-detail-cell">
                    <label>Request</label>
                    <strong>#{selectedAllocation.id}</strong>
                  </div>
                  <div className="admin-detail-cell">
                    <label>Group</label>
                    <strong>{selectedAllocation.totalPeople} people</strong>
                  </div>
                  <div className="admin-detail-cell">
                    <label>Priority</label>
                    <strong>{titleCase(selectedAllocation.priority)}</strong>
                  </div>
                  <div className="admin-detail-cell">
                    <label>Assigned shelter</label>
                    <strong>{selectedAllocation.recommendedShelterName || 'None'}</strong>
                  </div>
                  <div className="admin-detail-cell">
                    <label>Disaster</label>
                    <strong>{selectedAllocation.disasterLabel || titleCase(selectedAllocation.disasterCode)}</strong>
                  </div>
                  <div className="admin-detail-cell">
                    <label>Status</label>
                    <strong style={{ color: selectedAllocation.allocationConfirmed ? 'var(--teal)' : 'var(--amber)' }}>
                      {selectedAllocation.allocationConfirmed
                        ? 'Fixed — shelter confirmed'
                        : 'Awaiting admin confirmation'}
                    </strong>
                  </div>
                </div>
              </div>

              {selectedAllocation.locationLabel && (
                <div className="modal-block">
                  <h3>Location details</h3>
                  <div className="admin-detail-cell">
                    <label>Emergency request location</label>
                    <strong>{selectedAllocation.locationLabel}</strong>
                    {selectedAllocation.latitude && selectedAllocation.longitude && (
                      <div style={{ color: 'var(--muted)', fontSize: 11, marginTop: 3 }}>
                        Coordinates: {selectedAllocation.latitude.toFixed(5)}, {selectedAllocation.longitude.toFixed(5)}
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="modal-block">
                <h3>Decision</h3>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ background: 'var(--teal)', borderColor: 'var(--teal)', color: '#fff' }}
                    onClick={handleKeepAllocation}
                    disabled={modalBusy || selectedAllocation.allocationConfirmed}
                  >
                    {modalBusy ? <Spinner light /> : null} Keep allocation
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => setShowChangePicker((v) => !v)}
                    disabled={modalBusy}
                  >
                    Change shelter
                  </button>
                  <Link
                    className="btn"
                    to={`/admin/requests/${selectedAllocation.id}`}
                    style={{ padding: '8px 12px' }}
                  >
                    Full details & map →
                  </Link>
                </div>

                {showChangePicker && (
                  <div style={{ marginTop: 14, padding: 14, background: 'var(--surface2)', borderRadius: 'var(--radius)' }}>
                    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>
                      Select alternative shelter recommended by the engine:
                    </div>
                    {selectedAllocation.recommendations && selectedAllocation.recommendations.length > 0 ? (
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                        <select
                          className="select"
                          value={reassignTarget}
                          onChange={(e) => setReassignTarget(e.target.value)}
                          style={{ minWidth: 280 }}
                        >
                          <option value="">Select recommended alternative...</option>
                          {selectedAllocation.recommendations
                            .filter((r) => r.id !== selectedAllocation.recommendedShelterId)
                            .map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.name} (Suitability score {Math.round(r.suitabilityScore)})
                              </option>
                            ))}
                        </select>
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={handleChangeShelter}
                          disabled={modalBusy || !reassignTarget}
                        >
                          Confirm change
                        </button>
                      </div>
                    ) : (
                      <p style={{ color: 'var(--muted)', fontSize: 12, margin: 0 }}>
                        Open the full request details to view all shelters.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
