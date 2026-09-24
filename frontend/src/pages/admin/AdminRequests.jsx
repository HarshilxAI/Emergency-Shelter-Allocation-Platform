import { useEffect, useState, useCallback, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { adminApi } from '../../api/client';
import { Loading, ErrorState, EmptyState } from '../../components/Ui';
import { formatRelative, titleCase } from '../../utils/format';
import { PRIORITIES } from '../../utils/constants';

export default function AdminRequests() {
  const navigate = useNavigate();
  const [requests, setRequests] = useState(null);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [priority, setPriority] = useState('');
  const [status, setStatus] = useState('');

  const load = useCallback(async () => {
    setError(null);
    setRequests(null);
    try {
      const data = await adminApi.listRequests({
        limit: 200,
        priority: priority || undefined,
        status: status || undefined
      });
      setRequests(data.requests);
    } catch (err) {
      setError(err);
    }
  }, [priority, status]);

  useEffect(() => {
    load();
  }, [load]);

  const filteredRequests = useMemo(() => {
    if (!requests) return null;
    if (!search.trim()) return requests;
    const q = search.toLowerCase();
    return requests.filter(
      (r) =>
        String(r.id).includes(q) ||
        (r.disasterCode && r.disasterCode.toLowerCase().includes(q)) ||
        (r.disasterLabel && r.disasterLabel.toLowerCase().includes(q)) ||
        (r.locationLabel && r.locationLabel.toLowerCase().includes(q)) ||
        (r.userName && r.userName.toLowerCase().includes(q)) ||
        (r.recommendedShelterName && r.recommendedShelterName.toLowerCase().includes(q))
    );
  }, [requests, search]);

  const openFirstPending = () => {
    const p = (requests || []).find((r) => r.status === 'pending');
    if (p) {
      navigate(`/admin/requests/${p.id}`);
    } else {
      // If none are pending, filter view to pending requests
      setStatus('pending');
    }
  };

  const statusBadgeClass = (st) => {
    const s = String(st || '').toLowerCase();
    if (s === 'allocated') return 'status-badge allocated';
    if (s === 'pending') return 'status-badge pending';
    if (s === 'fulfilled') return 'status-badge available';
    return 'status-badge closed';
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
            Emergency intake
          </div>
          <h1 style={{ fontSize: 36, lineHeight: 1.1, letterSpacing: '-0.04em', margin: '0 0 8px' }}>
            Requests
          </h1>
          <p className="lead" style={{ color: 'var(--muted)', maxWidth: 760, margin: 0 }}>
            Review incoming emergency requests, user details, and allocation status.
          </p>
        </div>
        <button type="button" className="btn" onClick={openFirstPending}>
          View pending request
        </button>
      </div>

      <div className="toolbar">
        <input
          type="text"
          className="input"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search request ID, disaster, location, or user"
          aria-label="Search requests"
          style={{ maxWidth: 380 }}
        />
        <select
          className="select"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          aria-label="Filter by status"
          style={{ width: 'auto' }}
        >
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="allocated">Allocated</option>
          <option value="fulfilled">Fulfilled</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <select
          className="select"
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          aria-label="Filter by priority"
          style={{ width: 'auto' }}
        >
          <option value="">All priorities</option>
          {PRIORITIES.map((p) => (
            <option key={p.code} value={p.code}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      {error && <ErrorState error={error} onRetry={load} />}

      {requests === null && !error ? (
        <div style={{ padding: 40 }}>
          <Loading label="Loading requests" />
        </div>
      ) : filteredRequests && filteredRequests.length === 0 ? (
        <div className="card" style={{ padding: 40 }}>
          <EmptyState
            title="No requests match those filters"
            action={
              (priority || status || search) && (
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setPriority('');
                    setStatus('');
                    setSearch('');
                  }}
                >
                  Clear filters
                </button>
              )
            }
          >
            Emergency requests submitted by users will appear here.
          </EmptyState>
        </div>
      ) : (
        filteredRequests && (
          <div className="tablecard">
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Request</th>
                    <th>Disaster</th>
                    <th>Group</th>
                    <th>Priority</th>
                    <th>Status</th>
                    <th>Submitted</th>
                    <th style={{ textAlign: 'right' }} />
                  </tr>
                </thead>
                <tbody>
                  {filteredRequests.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <strong>#{r.id}</strong>
                        {r.locationLabel && (
                          <div style={{ color: 'var(--muted)', fontSize: 12 }}>{r.locationLabel}</div>
                        )}
                      </td>
                      <td>
                        <div>{r.disasterLabel || titleCase(r.disasterCode)}</div>
                        {r.recommendedShelterName && (
                          <div style={{ color: 'var(--muted)', fontSize: 11 }}>
                            → {r.recommendedShelterName}
                          </div>
                        )}
                      </td>
                      <td>
                        <strong>{r.totalPeople}</strong> people
                        <div style={{ color: 'var(--muted)', fontSize: 11 }}>
                          {r.childrenCount}c · {r.seniorCount}s · {r.womenCount}w
                        </div>
                      </td>
                      <td>
                        <span className={priorityBadgeClass(r.priority)}>
                          {titleCase(r.priority)}
                        </span>
                      </td>
                      <td>
                        <span className={statusBadgeClass(r.status)}>
                          {titleCase(r.status)}
                        </span>
                      </td>
                      <td style={{ color: 'var(--muted)', fontSize: 12 }}>
                        {formatRelative(r.createdAt)}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <Link className="btn btn-sm" to={`/admin/requests/${r.id}`} style={{ padding: '5px 12px', fontSize: 12 }}>
                          Open
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}
    </div>
  );
}
