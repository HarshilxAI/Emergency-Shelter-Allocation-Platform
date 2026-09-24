import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { adminApi } from '../../api/client';
import {
  Loading,
  ErrorState,
  EmptyState,
  ConfirmDialog,
  Spinner
} from '../../components/Ui';
import { useToast } from '../../context/ToastContext';
import { occupancyPercent, titleCase } from '../../utils/format';
import { SHELTER_STATUS } from '../../utils/constants';

function OccupancyCell({ shelter, onSaved }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(shelter.currentOccupancy));
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const n = Number.parseInt(value, 10);
    if (!Number.isFinite(n) || n < 0) {
      toast.error('Occupancy must be zero or more');
      return;
    }
    if (n > shelter.totalCapacity) {
      toast.error(`Occupancy cannot exceed the capacity of ${shelter.totalCapacity}`);
      return;
    }
    setBusy(true);
    try {
      const data = await adminApi.updateOccupancy(shelter.id, n);
      toast.success(`${shelter.name} updated to ${n} occupants`);
      setEditing(false);
      onSaved(data.shelter);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (!editing) {
    return (
      <button
        type="button"
        className="inline-link"
        style={{ background: 'none', border: 0, cursor: 'pointer', fontWeight: 700, color: 'var(--text)', fontSize: 13, textDecoration: 'underline' }}
        onClick={() => {
          setValue(String(shelter.currentOccupancy));
          setEditing(true);
        }}
        title="Click to edit occupancy"
      >
        {shelter.currentOccupancy} / {shelter.totalCapacity}
      </button>
    );
  }

  return (
    <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <input
        type="number"
        value={value}
        min="0"
        max={shelter.totalCapacity}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save();
          if (e.key === 'Escape') setEditing(false);
        }}
        style={{ width: 75, padding: '4px 6px', fontSize: 12 }}
        aria-label={`Occupancy for ${shelter.name}`}
        autoFocus
      />
      <button type="button" className="btn btn-sm btn-primary" onClick={save} disabled={busy} style={{ padding: '4px 8px', fontSize: 11 }}>
        {busy ? <Spinner light /> : 'Save'}
      </button>
      <button
        type="button"
        className="btn btn-sm"
        onClick={() => setEditing(false)}
        disabled={busy}
        style={{ padding: '4px 8px', fontSize: 11 }}
      >
        ✕
      </button>
    </span>
  );
}

export default function AdminShelters() {
  const toast = useToast();
  const [shelters, setShelters] = useState(null);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [pendingAction, setPendingAction] = useState(null);
  const [actionBusy, setActionBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await adminApi.listShelters({
        limit: 200,
        includeInactive: true,
        search: search || undefined,
        status: status || undefined
      });
      setShelters(data.shelters);
    } catch (err) {
      setError(err);
    }
  }, [search, status]);

  useEffect(() => {
    load();
  }, [load]);

  const replaceShelter = (updated) => {
    setShelters((list) => list.map((s) => (s.id === updated.id ? updated : s)));
  };

  const runAction = async () => {
    if (!pendingAction) return;
    setActionBusy(true);
    const { type, shelter } = pendingAction;
    try {
      if (type === 'deactivate') {
        const data = await adminApi.deactivateShelter(shelter.id);
        replaceShelter(data.shelter);
        toast.success(`${shelter.name} deactivated`);
      } else if (type === 'activate') {
        const data = await adminApi.updateShelter(shelter.id, { isActive: true });
        replaceShelter(data.shelter);
        toast.success(`${shelter.name} reactivated`);
      } else if (type === 'delete') {
        await adminApi.deleteShelter(shelter.id);
        setShelters((list) => list.filter((s) => s.id !== shelter.id));
        toast.success(`${shelter.name} deleted`);
      }
      setPendingAction(null);
    } catch (err) {
      toast.error(err.message);
      setPendingAction(null);
    } finally {
      setActionBusy(false);
    }
  };

  const actionCopy = {
    deactivate: {
      title: 'Deactivate this shelter?',
      message:
        'It will stop appearing in recommendations and shelter listings immediately. Its records and history are kept, and you can reactivate it later.',
      confirmLabel: 'Deactivate'
    },
    activate: {
      title: 'Reactivate this shelter?',
      message: 'It will become visible to users and eligible for recommendations again.',
      confirmLabel: 'Reactivate'
    },
    delete: {
      title: 'Delete this shelter permanently?',
      message:
        'This cannot be undone. If the shelter is referenced by any past emergency request, the deletion will be refused — deactivate it instead.',
      confirmLabel: 'Delete permanently'
    }
  };

  const statusBadgeClass = (st) => {
    const s = String(st || '').toLowerCase();
    if (s === 'available') return 'status-badge available';
    if (s === 'limited') return 'status-badge limited';
    if (s === 'full') return 'status-badge full';
    return 'status-badge closed';
  };

  return (
    <div className="container" style={{ maxWidth: 1240, margin: 'auto', padding: '34px 20px 80px' }}>
      <div className="hero" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 20, flexWrap: 'wrap', marginBottom: 22 }}>
        <div>
          <div className="eyebrow" style={{ textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--primary)', fontSize: 11, fontWeight: 800, marginBottom: 8 }}>
            Shelter management
          </div>
          <h1 style={{ fontSize: 36, lineHeight: 1.1, letterSpacing: '-0.04em', margin: '0 0 8px' }}>
            Shelters
          </h1>
          <p className="lead" style={{ color: 'var(--muted)', maxWidth: 760, margin: 0 }}>
            Manage registered shelters, capacity, facilities, and operational status.
          </p>
        </div>
        <Link className="btn btn-primary" to="/admin/shelters/new">
          + Add shelter
        </Link>
      </div>

      <div className="toolbar">
        <input
          type="text"
          className="input"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search shelter name or address"
          aria-label="Search shelters"
          style={{ maxWidth: 360 }}
        />
        <select
          className="select"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          aria-label="Filter by status"
          style={{ width: 'auto' }}
        >
          <option value="">All statuses</option>
          {Object.entries(SHELTER_STATUS).map(([code, meta]) => (
            <option key={code} value={code}>
              {meta.label}
            </option>
          ))}
        </select>
      </div>

      {error && <ErrorState error={error} onRetry={load} />}

      {shelters === null && !error ? (
        <div style={{ padding: 40 }}>
          <Loading label="Loading shelters" />
        </div>
      ) : shelters && shelters.length === 0 ? (
        <div className="card" style={{ padding: 40 }}>
          <EmptyState
            title="No shelters match those filters"
            action={
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setSearch('');
                  setStatus('');
                }}
              >
                Clear filters
              </button>
            }
          >
            Adjust the search or status filter, or add a new shelter.
          </EmptyState>
        </div>
      ) : (
        shelters && (
          <div className="tablecard">
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Shelter</th>
                    <th>Total</th>
                    <th>Occupied</th>
                    <th>Free</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {shelters.map((s) => {
                    const pct = occupancyPercent(s.currentOccupancy, s.totalCapacity);
                    return (
                      <tr key={s.id} style={!s.isActive ? { opacity: 0.6 } : undefined}>
                        <td>
                          <div style={{ fontWeight: 750 }}>{s.name}</div>
                          <div style={{ color: 'var(--muted)', fontSize: 12 }}>{s.address}</div>
                        </td>
                        <td>{s.totalCapacity}</td>
                        <td style={{ minWidth: 140 }}>
                          <OccupancyCell shelter={s} onSaved={replaceShelter} />
                          <div className={`progress-bar-wrap ${pct >= 100 ? 'danger' : pct >= 80 ? 'warn' : ''}`} style={{ margin: '4px 0 0', height: 4 }}>
                            <span style={{ width: `${Math.min(pct, 100)}%` }} />
                          </div>
                        </td>
                        <td><strong>{s.availableCapacity}</strong></td>
                        <td>
                          <span className={statusBadgeClass(s.status)}>
                            {titleCase(s.status)}
                          </span>
                          {!s.isActive && (
                            <span className="status-badge closed" style={{ marginLeft: 6 }}>
                              Inactive
                            </span>
                          )}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                            <Link
                              className="btn btn-sm"
                              to={`/admin/shelters/${s.id}/edit`}
                              style={{ padding: '5px 11px', fontSize: 12 }}
                            >
                              Edit
                            </Link>
                            {s.isActive ? (
                              <button
                                type="button"
                                className="btn btn-sm"
                                onClick={() => setPendingAction({ type: 'deactivate', shelter: s })}
                                style={{ padding: '5px 9px', fontSize: 12 }}
                              >
                                Deactivate
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="btn btn-sm"
                                onClick={() => setPendingAction({ type: 'activate', shelter: s })}
                                style={{ padding: '5px 9px', fontSize: 12 }}
                              >
                                Reactivate
                              </button>
                            )}
                            <button
                              type="button"
                              className="btn btn-sm"
                              style={{ color: 'var(--red)', padding: '5px 9px', fontSize: 12 }}
                              onClick={() => setPendingAction({ type: 'delete', shelter: s })}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {pendingAction && (
        <ConfirmDialog
          {...actionCopy[pendingAction.type]}
          tone={pendingAction.type === 'activate' ? 'primary' : 'danger'}
          busy={actionBusy}
          onConfirm={runAction}
          onCancel={() => setPendingAction(null)}
        />
      )}
    </div>
  );
}
