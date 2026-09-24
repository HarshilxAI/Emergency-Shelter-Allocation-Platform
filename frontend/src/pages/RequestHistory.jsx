import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { requestApi } from '../api/client';
import { Loading, ErrorState, EmptyState } from '../components/Ui';
import { formatDateTime, titleCase } from '../utils/format';

export default function RequestHistory() {
  const [requests, setRequests] = useState(null);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('');

  const load = useCallback(async () => {
    setError(null);
    setRequests(null);
    try {
      const data = await requestApi.list({ limit: 100, status: filter || undefined });
      setRequests(data.requests);
    } catch (err) {
      setError(err);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  const priorityPillClass = (p) => {
    const norm = String(p || '').toLowerCase();
    if (norm === 'critical') return 'pill danger';
    if (norm === 'high') return 'pill warning';
    if (norm === 'medium') return 'pill primary';
    return 'pill neutral';
  };

  const statusPillClass = (s) => {
    const norm = String(s || '').toLowerCase();
    if (norm === 'allocated') return 'pill success';
    if (norm === 'pending') return 'pill warning';
    if (norm === 'closed' || norm === 'cancelled') return 'pill danger';
    return 'pill neutral';
  };

  return (
    <div className="container" style={{ maxWidth: 1180, margin: 'auto', padding: '34px 20px 80px' }}>
      <div className="hero" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 20, flexWrap: 'wrap' }}>
        <div>
          <div className="eyebrow" style={{ textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--primary)', fontSize: 11, fontWeight: 800, marginBottom: 8 }}>
            History
          </div>
          <h1 style={{ fontSize: 36, lineHeight: 1.1, letterSpacing: '-0.04em', margin: '0 0 8px' }}>
            Your requests
          </h1>
          <p className="lead" style={{ color: 'var(--muted)', maxWidth: 680, margin: 0 }}>
            Review every emergency request you have submitted and its allocation status.
          </p>
        </div>
        <div className="actions" style={{ display: 'flex', gap: 10 }}>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            aria-label="Filter by status"
            style={{ width: 160 }}
          >
            <option value="">All statuses</option>
            <option value="pending">Awaiting allocation</option>
            <option value="allocated">Allocated</option>
            <option value="fulfilled">Fulfilled</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <Link className="btn btn-primary" to="/request/new">
            New request
          </Link>
        </div>
      </div>

      <div className="divider" style={{ height: 1, background: 'var(--border)', margin: '26px 0' }} />

      {error && <ErrorState error={error} onRetry={load} />}

      {requests === null && !error ? (
        <div style={{ padding: 40 }}>
          <Loading label="Loading your requests" />
        </div>
      ) : requests && requests.length === 0 ? (
        <div className="card" style={{ padding: 40 }}>
          <EmptyState
            title={filter ? 'No requests match that filter' : 'No requests yet'}
            action={
              filter ? (
                <button type="button" className="btn" onClick={() => setFilter('')}>
                  Show all requests
                </button>
              ) : (
                <Link className="btn btn-primary" to="/request/new">
                  Create your first request
                </Link>
              )
            }
          >
            {filter
              ? 'Try selecting a different status filter.'
              : 'When you submit an emergency shelter request, it will be listed here with live updates.'}
          </EmptyState>
        </div>
      ) : (
        requests && (
          <div className="tablecard">
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Disaster</th>
                    <th>Priority</th>
                    <th>People</th>
                    <th>Recommended shelter</th>
                    <th>Status</th>
                    <th>Submitted</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {requests.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <strong>{r.disasterLabel || titleCase(r.disasterCode)}</strong>
                        {r.locationLabel && (
                          <div style={{ color: 'var(--muted)', fontSize: 11, marginTop: 2 }}>
                            {r.locationLabel}
                          </div>
                        )}
                      </td>
                      <td>
                        <span className={priorityPillClass(r.priority)}>
                          {titleCase(r.priority)}
                        </span>
                      </td>
                      <td style={{ fontWeight: 600 }}>{r.totalPeople}</td>
                      <td>
                        {r.recommendedShelterName ? (
                          <span>{r.recommendedShelterName}</span>
                        ) : (
                          <span style={{ color: 'var(--muted)' }}>No shelter allocated</span>
                        )}
                      </td>
                      <td>
                        <span className={statusPillClass(r.status)}>
                          {titleCase(r.status)}
                        </span>
                      </td>
                      <td style={{ color: 'var(--muted)', fontSize: 12 }}>
                        {formatDateTime(r.createdAt)}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <Link className="btn btn-sm" to={`/requests/${r.id}`} style={{ padding: '6px 12px', fontSize: 12 }}>
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
