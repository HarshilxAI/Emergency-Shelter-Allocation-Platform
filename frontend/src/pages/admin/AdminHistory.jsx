import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { adminApi, getToken } from '../../api/client';
import { Loading, ErrorState, EmptyState } from '../../components/Ui';
import { formatDateTime, titleCase } from '../../utils/format';

const ACTION_LABEL = {
  allocated: 'Allocated',
  confirmed: 'Confirmed',
  reassigned: 'Reassigned',
  closed: 'Closed',
  shelter_verified: 'Facility verified',
  shelter_activated: 'Facility activated',
  shelter_updated: 'Shelter updated',
  shelter_deactivated: 'Shelter deactivated'
};

export default function AdminHistory() {
  const [entries, setEntries] = useState(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Selected entry for modal
  const [selectedEntry, setSelectedEntry] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const data = await adminApi.listHistory({
        limit: 200,
        search: search.trim() || undefined,
        action: actionFilter || undefined,
        fromDate: fromDate || undefined,
        toDate: toDate ? `${toDate}T23:59:59` : undefined
      });
      setEntries(data.entries);
      setTotal(data.total);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [search, actionFilter, fromDate, toDate]);

  useEffect(() => {
    const timer = setTimeout(() => {
      load();
    }, 300);
    return () => clearTimeout(timer);
  }, [load]);

  const exportXlsx = async () => {
    try {
      setExporting(true);
      const url = adminApi.historyExportUrl({
        search: search.trim() || undefined,
        action: actionFilter || undefined,
        fromDate: fromDate || undefined,
        toDate: toDate ? `${toDate}T23:59:59` : undefined
      });
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      if (!res.ok) throw new Error('Failed to export history');
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl;
      a.download = `esap-allocation-history-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objUrl);
    } catch (err) {
      setError(err);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="container" style={{ maxWidth: 1240, margin: 'auto', padding: '34px 20px 80px' }}>
      <div className="hero" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 20, flexWrap: 'wrap', marginBottom: 22 }}>
        <div>
          <div className="eyebrow" style={{ textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--primary)', fontSize: 11, fontWeight: 800, marginBottom: 8 }}>
            Audit trail
          </div>
          <h1 style={{ fontSize: 36, lineHeight: 1.1, letterSpacing: '-0.04em', margin: '0 0 8px' }}>
            History
          </h1>
          <p className="lead" style={{ color: 'var(--muted)', maxWidth: 760, margin: 0 }}>
            Review previous requests, allocation decisions, and administrative actions.
          </p>
        </div>
        <button
          type="button"
          className="btn"
          onClick={exportXlsx}
          disabled={exporting}
        >
          {exporting ? 'Exporting...' : 'Export history (.xlsx)'}
        </button>
      </div>

      <div className="toolbar" style={{ flexWrap: 'wrap' }}>
        <input
          type="text"
          className="input"
          placeholder="Search request, shelter, or action"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: 360 }}
        />
        <select
          className="select"
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          style={{ width: 'auto' }}
        >
          <option value="">All actions</option>
          <option value="allocated">Allocated</option>
          <option value="confirmed">Confirmed</option>
          <option value="reassigned">Reassigned</option>
          <option value="closed">Closed</option>
          <option value="shelter_verified">Facility verified</option>
          <option value="shelter_activated">Facility activated</option>
          <option value="shelter_updated">Shelter updated</option>
          <option value="shelter_deactivated">Shelter deactivated</option>
        </select>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--muted)' }}>
          <span>From:</span>
          <input
            type="date"
            className="input"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            style={{ width: 140, padding: '7px 8px', fontSize: 12 }}
          />
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--muted)' }}>
          <span>To:</span>
          <input
            type="date"
            className="input"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            style={{ width: 140, padding: '7px 8px', fontSize: 12 }}
          />
        </div>
      </div>

      {error && <ErrorState error={error} onRetry={load} />}

      {loading && !entries ? (
        <div style={{ padding: 40 }}>
          <Loading label="Loading history" />
        </div>
      ) : entries && entries.length === 0 ? (
        <div className="card" style={{ padding: 40 }}>
          <EmptyState title="No history found">
            Allocation and shelter lifecycle events will appear here as they are recorded.
          </EmptyState>
        </div>
      ) : (
        entries && (
          <div className="tablecard" style={{ padding: '0 20px' }}>
            <div className="history-grid-row head">
              <div>Date / time</div>
              <div>Request</div>
              <div>Action</div>
              <div>By</div>
              <div style={{ textAlign: 'right' }}>Details</div>
            </div>

            {entries.map((e) => (
              <div className="history-grid-row" key={e.id}>
                <div style={{ color: 'var(--muted)', fontSize: 12 }}>
                  {formatDateTime(e.createdAt)}
                </div>
                <div>
                  <strong>{e.requestId ? `#${e.requestId}` : 'System'}</strong>
                </div>
                <div>
                  <span style={{ fontWeight: 600 }}>
                    {ACTION_LABEL[e.action] || titleCase(e.action)}
                  </span>
                  {e.shelterName && (
                    <span style={{ color: 'var(--muted)', fontSize: 12, marginLeft: 6 }}>
                      → {e.shelterName}
                    </span>
                  )}
                  {e.notes && (
                    <div style={{ color: 'var(--muted)', fontSize: 11, marginTop: 2 }}>
                      {e.notes}
                    </div>
                  )}
                </div>
                <div>{e.performedByName || 'Administrator'}</div>
                <div style={{ textAlign: 'right' }}>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => setSelectedEntry(e)}
                    style={{ padding: '4px 10px', fontSize: 12 }}
                  >
                    Details
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* Details modal matching REFERENCE_ADMIN_DASHBOARD.html lines 274-281 */}
      {selectedEntry && (
        <div className="modal-overlay" onClick={(ev) => { if (ev.target === ev.currentTarget) setSelectedEntry(null); }}>
          <div className="modal-dialog" style={{ maxWidth: 640 }}>
            <div className="modal-dialog-head">
              <div>
                <h2>
                  {selectedEntry.requestId ? `Request #${selectedEntry.requestId}` : 'System'} — History details
                </h2>
                <p>{formatDateTime(selectedEntry.createdAt)}</p>
              </div>
              <button type="button" className="modal-close-btn" onClick={() => setSelectedEntry(null)}>
                ×
              </button>
            </div>

            <div className="modal-dialog-body">
              <div className="modal-block">
                <h3>Complete record</h3>
                <div className="admin-detail-grid">
                  <div className="admin-detail-cell">
                    <label>Reference</label>
                    <strong>{selectedEntry.requestId ? `Request #${selectedEntry.requestId}` : 'System'}</strong>
                  </div>
                  <div className="admin-detail-cell">
                    <label>Action</label>
                    <strong>{ACTION_LABEL[selectedEntry.action] || titleCase(selectedEntry.action)}</strong>
                  </div>
                  <div className="admin-detail-cell">
                    <label>Recorded by</label>
                    <strong>{selectedEntry.performedByName || 'Administrator'}</strong>
                    {selectedEntry.performedByEmail && (
                      <div style={{ color: 'var(--muted)', fontSize: 11 }}>{selectedEntry.performedByEmail}</div>
                    )}
                  </div>
                  <div className="admin-detail-cell">
                    <label>Recorded at</label>
                    <strong>{formatDateTime(selectedEntry.createdAt)}</strong>
                  </div>
                </div>
              </div>

              {selectedEntry.shelterName && (
                <div className="modal-block">
                  <h3>Shelter details</h3>
                  <div className="admin-detail-cell">
                    <label>Shelter</label>
                    <strong>{selectedEntry.shelterName}</strong>
                    {selectedEntry.shelterId && (
                      <div style={{ color: 'var(--muted)', fontSize: 11 }}>ID: {selectedEntry.shelterId}</div>
                    )}
                  </div>
                </div>
              )}

              {selectedEntry.notes && (
                <div className="modal-block">
                  <h3>Notes & context</h3>
                  <div className="admin-detail-cell">
                    <strong>{selectedEntry.notes}</strong>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setSelectedEntry(null)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
