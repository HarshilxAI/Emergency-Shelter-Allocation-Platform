import { useEffect, useState, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { requestApi, shelterApi } from '../api/client';
import { Loading, ErrorState, EmptyState, Alert } from '../components/Ui';
import { formatRelative, titleCase } from '../utils/format';

export default function Dashboard() {
  const { user } = useAuth();
  const location = useLocation();

  const [requests, setRequests] = useState(null);
  const [shelterSummary, setShelterSummary] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [reqData, shelterData] = await Promise.all([
        requestApi.list({ limit: 10 }),
        shelterApi.list({ limit: 200 })
      ]);
      setRequests(reqData.requests);

      const list = shelterData.shelters || [];
      setShelterSummary({
        total: list.length,
        available: list.filter((s) => s.status === 'available').length,
        spaces: list
          .filter((s) => s.status === 'available' || s.status === 'limited')
          .reduce((sum, s) => sum + (s.availableCapacity || 0), 0)
      });
    } catch (err) {
      setError(err);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const active = (requests || []).find(
    (r) => r.status === 'allocated' || r.status === 'pending'
  );

  const firstName = user?.name ? user.name.split(' ')[0] : 'User';

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

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
    if (norm === 'closed') return 'pill neutral';
    return 'pill neutral';
  };

  return (
    <div className="container" style={{ maxWidth: 1180, margin: 'auto', padding: '34px 20px 80px' }}>
      <div className="hero" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 20, flexWrap: 'wrap' }}>
        <div>
          <div className="eyebrow" style={{ textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--primary)', fontSize: 11, fontWeight: 800, marginBottom: 8 }}>
            User dashboard
          </div>
          <h1 style={{ fontSize: 36, lineHeight: 1.1, letterSpacing: '-0.04em', margin: '0 0 8px' }}>
            {getGreeting()}, {firstName}.
          </h1>
          <p className="lead" style={{ color: 'var(--muted)', maxWidth: 680, margin: 0 }}>
            Access emergency shelter allocation, review active requests, and browse shelters from one place.
          </p>
        </div>
        <div className="actions" style={{ display: 'flex', gap: 9 }}>
          <Link className="btn btn-primary" to="/request/new" style={{ padding: '10px 18px', fontWeight: 700 }}>
            + New emergency request
          </Link>
        </div>
      </div>

      <div className="divider" style={{ height: 1, background: 'var(--border)', margin: '26px 0' }} />

      {location.state?.denied && (
        <div style={{ marginBottom: 20 }}>
          <Alert tone="warn" title="Administrator access required">
            That area is limited to accounts with the platform administrator role.
          </Alert>
        </div>
      )}

      {error && (
        <div style={{ marginBottom: 20 }}>
          <ErrorState error={error} onRetry={load} />
        </div>
      )}

      <div className="dashboard-grid">
        <div>
          {active ? (
            <>
              <div className="welcome-card">
                <div className="eyebrow" style={{ textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--primary)', fontSize: 11, fontWeight: 800, marginBottom: 8 }}>
                  Current allocation
                </div>
                <h2 style={{ fontSize: 22, margin: '0 0 8px' }}>
                  {active.recommendedShelterName
                    ? 'Your latest request has a shelter assigned.'
                    : 'Your emergency request is being processed.'}
                </h2>
                <p className="lead" style={{ color: 'var(--muted)', margin: 0, fontSize: 13.5 }}>
                  {active.recommendedShelterName
                    ? `${active.recommendedShelterName} is currently the recommended allocation for your submitted emergency request.`
                    : 'The allocation engine is reviewing suitable shelters with capacity for your group.'}
                </p>
                <span className="mini">
                  ● Shelter {active.status === 'allocated' ? 'allocated' : 'pending'} · {titleCase(active.priority)} priority
                </span>
              </div>

              <div className="active-request-card" style={{ marginTop: 14 }}>
                <div className="request-head">
                  <div>
                    <div className="request-meta">
                      <span className={priorityPillClass(active.priority)}>{titleCase(active.priority)} priority</span>
                      <span className={statusPillClass(active.status)}>Shelter {active.status}</span>
                      <span className="pill primary">{active.disasterLabel || titleCase(active.disasterCode)}</span>
                    </div>
                    <h2 style={{ fontSize: 20, margin: '0 0 4px' }}>
                      {active.totalPeople} {active.totalPeople === 1 ? 'person' : 'people'} · Request #{active.id}
                    </h2>
                    <p className="lead" style={{ color: 'var(--muted)', fontSize: 12.5, margin: 0 }}>
                      {active.recommendedShelterName || 'Awaiting assignment'} · submitted {formatRelative(active.createdAt)}
                    </p>
                  </div>
                  {active.suitabilityScore ? (
                    <div className="score-display">
                      <strong>{Math.round(active.suitabilityScore)}</strong>
                      <span>allocation score</span>
                    </div>
                  ) : null}
                </div>
                <div style={{ display: 'flex', gap: 10, marginTop: 16, alignItems: 'center' }}>
                  <Link className="btn btn-primary" to={`/requests/${active.id}`} style={{ padding: '8px 14px', fontSize: 13 }}>
                    View recommendations
                  </Link>
                  <Link to="/requests" style={{ color: 'var(--text)', fontWeight: 700, fontSize: 13, textDecoration: 'none', padding: '8px 6px' }}>
                    View request history →
                  </Link>
                </div>
              </div>
            </>
          ) : (
            <div className="welcome-card">
              <div className="eyebrow" style={{ textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--primary)', fontSize: 11, fontWeight: 800, marginBottom: 8 }}>
                Emergency shelter platform
              </div>
              <h2 style={{ fontSize: 22, margin: '0 0 8px' }}>No active emergency requests</h2>
              <p className="lead" style={{ color: 'var(--muted)', margin: 0, fontSize: 13.5 }}>
                You have no active emergency shelter requests in the system. If you or your group need emergency shelter, start a request below.
              </p>
              <div style={{ marginTop: 18 }}>
                <Link className="btn btn-primary" to="/request/new" style={{ padding: '9px 16px', fontWeight: 700 }}>
                  + New emergency request
                </Link>
              </div>
            </div>
          )}
        </div>

        <aside className="side-panel">
          <div className="eyebrow" style={{ textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--primary)', fontSize: 11, fontWeight: 800, marginBottom: 8 }}>
            System snapshot
          </div>
          <h2 style={{ fontSize: 20, margin: '0 0 14px' }}>At a glance</h2>
          <div className="statusrow">
            <span>Registered shelters</span>
            <strong>{shelterSummary ? shelterSummary.total : '—'}</strong>
          </div>
          <div className="statusrow">
            <span>Currently available</span>
            <strong style={{ color: 'var(--teal)' }}>{shelterSummary ? shelterSummary.available : '—'}</strong>
          </div>
          <div className="statusrow">
            <span>Spaces available</span>
            <strong>{shelterSummary ? shelterSummary.spaces.toLocaleString() : '—'}</strong>
          </div>
          <div className="statusrow">
            <span>Platform status</span>
            <span className="pill success">Operational</span>
          </div>
          <div style={{ marginTop: 18 }}>
            <Link className="btn" to="/shelters" style={{ width: '100%', textAlign: 'center', display: 'block', padding: '10px 12px' }}>
              Browse shelters
            </Link>
          </div>
        </aside>
      </div>

      <div className="quickgrid" style={{ marginTop: 16 }}>
        <Link className="quick-btn" to="/request/new">
          <div className="icon">⌖</div>
          <h3>Find a shelter</h3>
          <p>Submit a new emergency request and receive ranked recommendations.</p>
        </Link>
        <Link className="quick-btn" to="/shelters">
          <div className="icon">▦</div>
          <h3>Browse shelters</h3>
          <p>Compare capacity, distance, status, facilities, and suitability.</p>
        </Link>
        <Link className="quick-btn" to="/requests">
          <div className="icon">↺</div>
          <h3>My requests</h3>
          <p>Open previous requests and review their recommendations.</p>
        </Link>
      </div>

      {shelterSummary && (
        <div className="statgrid">
          <div className="stat-box">
            <div className="statnum">{shelterSummary.total}</div>
            <div className="statlabel">Shelters in system</div>
          </div>
          <div className="stat-box">
            <div className="statnum" style={{ color: 'var(--teal)' }}>{shelterSummary.available}</div>
            <div className="statlabel">Currently available</div>
          </div>
          <div className="stat-box">
            <div className="statnum">{shelterSummary.spaces.toLocaleString()}</div>
            <div className="statlabel">Free spaces right now</div>
          </div>
        </div>
      )}

      <div className="tablecard">
        <div className="tablehead">
          <h3>Recent requests</h3>
          <Link className="btn btn-sm" to="/requests" style={{ padding: '6px 12px', fontSize: 12 }}>
            View all
          </Link>
        </div>

        {requests === null ? (
          <div style={{ padding: 30 }}>
            <Loading label="Loading your requests" />
          </div>
        ) : requests.length === 0 ? (
          <div style={{ padding: 30 }}>
            <EmptyState
              title="No requests yet"
              action={
                <Link className="btn btn-primary" to="/request/new">
                  Create your first request
                </Link>
              }
            >
              When you submit an emergency request, it will appear here with its assigned shelter and status.
            </EmptyState>
          </div>
        ) : (
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
                    <td><strong>{r.disasterLabel || titleCase(r.disasterCode)}</strong></td>
                    <td>
                      <span className={priorityPillClass(r.priority)}>
                        {titleCase(r.priority)}
                      </span>
                    </td>
                    <td>{r.totalPeople}</td>
                    <td>{r.recommendedShelterName || <span style={{ color: 'var(--muted)' }}>None found</span>}</td>
                    <td>
                      <span className={statusPillClass(r.status)}>
                        {titleCase(r.status)}
                      </span>
                    </td>
                    <td style={{ color: 'var(--muted)', fontSize: 12 }}>{formatRelative(r.createdAt)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <Link className="btn btn-sm" to={`/requests/${r.id}`} style={{ padding: '5px 12px', fontSize: 12 }}>
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
