import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { adminApi, shelterApi } from '../../api/client';
import { Loading, ErrorState } from '../../components/Ui';
import { formatRelative, titleCase, occupancyPercent } from '../../utils/format';

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [shelterList, setShelterList] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [statsData, shelterData] = await Promise.all([
        adminApi.stats(),
        shelterApi.list({ limit: 10 })
      ]);
      setStats(statsData);
      setShelterList(shelterData.shelters || []);
    } catch (err) {
      setError(err);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (error) {
    return (
      <div className="container" style={{ maxWidth: 1240, margin: 'auto', padding: '34px 20px 80px' }}>
        <ErrorState error={error} onRetry={load} />
      </div>
    );
  }

  if (!stats) return <Loading label="Loading operations overview" />;

  const { shelters, requests, recentRequests } = stats;

  const pendingRequests = (recentRequests || []).filter(
    (r) => r.status === 'pending'
  );

  const statusBadgeClass = (st) => {
    const s = String(st || '').toLowerCase();
    if (s === 'available') return 'status-badge available';
    if (s === 'limited') return 'status-badge limited';
    if (s === 'full') return 'status-badge full';
    if (s === 'pending') return 'status-badge pending';
    if (s === 'allocated') return 'status-badge allocated';
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
            Platform operations
          </div>
          <h1 style={{ fontSize: 36, lineHeight: 1.1, letterSpacing: '-0.04em', margin: '0 0 8px' }}>
            Admin dashboard
          </h1>
          <p className="lead" style={{ color: 'var(--muted)', maxWidth: 760, margin: 0 }}>
            Monitor shelter capacity, emergency requests, and active allocations from one operational view.
          </p>
        </div>
        <div className="actions" style={{ display: 'flex', gap: 10 }}>
          <Link className="btn" to="/admin/shelters">
            Manage shelters
          </Link>
          <Link className="btn btn-primary" to="/admin/shelters/new">
            + Add shelter
          </Link>
        </div>
      </div>

      <div className="grid4">
        <div className="metric-card">
          <div className="value">{shelters.total}</div>
          <div className="label">Total shelters</div>
          <div className="note">Registered in platform</div>
        </div>
        <div className="metric-card green">
          <div className="value">{shelters.available}</div>
          <div className="label">Available shelters</div>
          <div className="note">Currently accepting groups</div>
        </div>
        <div className="metric-card">
          <div className="value">{shelters.availableCapacity.toLocaleString()}</div>
          <div className="label">Free spaces</div>
          <div className="note">Across available shelters</div>
        </div>
        <div className="metric-card warn">
          <div className="value">{requests.active}</div>
          <div className="label">Active requests</div>
          <div className="note">{requests.pending} awaiting allocation</div>
        </div>
      </div>

      <div className="admin-main-grid">
        <div className="admin-panel">
          <div className="panel-head">
            <h2>Shelter capacity</h2>
            <span>Current status</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Shelter</th>
                  <th>Capacity</th>
                  <th>Free</th>
                  <th>Occupancy</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {shelterList && shelterList.length > 0 ? (
                  shelterList.map((s) => {
                    const pct = occupancyPercent(s.currentOccupancy, s.totalCapacity);
                    return (
                      <tr key={s.id}>
                        <td>
                          <div style={{ fontWeight: 750 }}>{s.name}</div>
                          <div style={{ color: 'var(--muted)', fontSize: 12 }}>{s.address}</div>
                        </td>
                        <td>{s.totalCapacity}</td>
                        <td><strong>{s.availableCapacity}</strong></td>
                        <td style={{ minWidth: 110 }}>
                          {pct}%
                          <div className={`progress-bar-wrap ${pct >= 100 ? 'danger' : pct >= 80 ? 'warn' : ''}`} style={{ margin: '4px 0 0', height: 5 }}>
                            <span style={{ width: `${Math.min(pct, 100)}%` }} />
                          </div>
                        </td>
                        <td>
                          <span className={statusBadgeClass(s.status)}>
                            {titleCase(s.status)}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', color: 'var(--muted)', padding: 24 }}>
                      No shelters recorded.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="admin-panel">
          <div className="panel-head">
            <h2>Requests needing attention</h2>
            <span>{requests.pending} pending</span>
          </div>

          {pendingRequests.length === 0 ? (
            <p style={{ color: 'var(--muted)', fontSize: 13, padding: '16px 0' }}>
              No emergency requests are currently pending review.
            </p>
          ) : (
            pendingRequests.slice(0, 5).map((r) => (
              <div className="queue-item" key={r.id}>
                <div className="queue-top">
                  <strong>#{r.id}</strong>
                  <span className={priorityBadgeClass(r.priority)}>
                    {titleCase(r.priority)}
                  </span>
                </div>
                <div className="queue-meta">
                  {titleCase(r.disasterCode)} · {r.totalPeople} {r.totalPeople === 1 ? 'person' : 'people'}
                  {r.userName ? ` · ${r.userName}` : ''}
                </div>
                <div className="queue-action">
                  <span style={{ color: 'var(--muted)', fontSize: 12 }}>
                    {formatRelative(r.createdAt)}
                  </span>
                  <Link className="btn btn-sm" to={`/admin/requests/${r.id}`} style={{ padding: '4px 10px', fontSize: 12 }}>
                    Open
                  </Link>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
