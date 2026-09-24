import { useEffect, useState, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { shelterApi } from '../api/client';
import { ShelterMap } from '../components/Maps';
import { Loading, ErrorState, EmptyState } from '../components/Ui';
import { getCurrentPosition } from '../utils/geo';
import { formatDistance, occupancyPercent } from '../utils/format';
import { SHELTER_STATUS } from '../utils/constants';

export default function ShelterList() {
  const [shelters, setShelters] = useState(null);
  const [error, setError] = useState(null);
  const [origin, setOrigin] = useState(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState('nearest');
  const [view, setView] = useState('list');
  const [locating, setLocating] = useState(true);

  const load = useCallback(
    async (position) => {
      setError(null);
      try {
        const data = await shelterApi.list({
          limit: 200,
          search: search || undefined,
          status: status || undefined,
          latitude: position?.latitude,
          longitude: position?.longitude
        });
        setShelters(data.shelters);
      } catch (err) {
        setError(err);
      }
    },
    [search, status]
  );

  useEffect(() => {
    let active = true;
    getCurrentPosition({ timeout: 8000 })
      .then((pos) => active && setOrigin(pos))
      .catch(() => {})
      .finally(() => active && setLocating(false));
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (locating) return;
    load(origin);
  }, [load, origin, locating]);

  const sortedShelters = useMemo(() => {
    if (!shelters) return null;
    const list = [...shelters];
    if (sort === 'space') {
      list.sort((a, b) => (b.availableCapacity || 0) - (a.availableCapacity || 0));
    } else if (sort === 'occupancy') {
      list.sort((a, b) => {
        const pctA = occupancyPercent(a.currentOccupancy, a.totalCapacity);
        const pctB = occupancyPercent(b.currentOccupancy, b.totalCapacity);
        return pctA - pctB;
      });
    } else {
      // nearest
      list.sort((a, b) => (a.distanceKm ?? 99999) - (b.distanceKm ?? 99999));
    }
    return list;
  }, [shelters, sort]);

  const pillClass = (st) => {
    if (st === 'available') return 'pill success';
    if (st === 'limited') return 'pill warning';
    return 'pill danger';
  };

  const cardClass = (st) => {
    if (st === 'limited') return 'card sheltercard limited';
    if (st === 'full' || st === 'closed') return 'card sheltercard full';
    return 'card sheltercard';
  };

  return (
    <div className="container" style={{ maxWidth: 1180, margin: 'auto', padding: '34px 20px 80px' }}>
      <div className="hero" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 20, flexWrap: 'wrap' }}>
        <div>
          <div className="eyebrow" style={{ textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--primary)', fontSize: 11, fontWeight: 800, marginBottom: 8 }}>
            Shelter directory
          </div>
          <h1 style={{ fontSize: 36, lineHeight: 1.1, letterSpacing: '-0.04em', margin: '0 0 8px' }}>
            All shelters
          </h1>
          <p className="lead" style={{ color: 'var(--muted)', maxWidth: 680, margin: 0 }}>
            Compare registered shelters by availability, capacity, distance, and facilities.
          </p>
        </div>
        <div className="segment">
          <button
            type="button"
            className={view === 'list' ? 'active' : ''}
            onClick={() => setView('list')}
          >
            List
          </button>
          <button
            type="button"
            className={view === 'map' ? 'active' : ''}
            onClick={() => setView('map')}
          >
            Map
          </button>
        </div>
      </div>

      <div className="divider" style={{ height: 1, background: 'var(--border)', margin: '26px 0' }} />

      <div className="shelter-tools">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or address"
          aria-label="Search shelters"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          {Object.entries(SHELTER_STATUS).map(([code, meta]) => (
            <option key={code} value={code}>
              {meta.label}
            </option>
          ))}
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          aria-label="Sort shelters"
        >
          <option value="nearest">Nearest first</option>
          <option value="space">Most space</option>
          <option value="occupancy">Lowest occupancy</option>
        </select>
      </div>

      {error && <ErrorState error={error} onRetry={() => load(origin)} />}

      {shelters === null && !error ? (
        <div style={{ padding: 40 }}>
          <Loading label="Loading shelters" />
        </div>
      ) : sortedShelters && sortedShelters.length === 0 ? (
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
            Try adjusting your search query or status filter.
          </EmptyState>
        </div>
      ) : (
        sortedShelters &&
        (view === 'map' ? (
          <div>
            <ShelterMap
              origin={origin}
              shelters={sortedShelters}
              height="map-frame-tall"
              showLegend={true}
            />
            <div className="card" style={{ padding: '14px 18px', marginTop: 12, fontSize: 13 }}>
              <strong>{sortedShelters.length} shelters shown on map</strong>
              <span style={{ color: 'var(--muted)' }}> · Click a shelter marker to inspect capacity, status, and get directions.</span>
            </div>
          </div>
        ) : (
          <div className="sheltergrid">
            {sortedShelters.map((s) => {
              const pct = occupancyPercent(s.currentOccupancy, s.totalCapacity);
              const isAvailable = s.status === 'available' || s.status === 'limited';
              return (
                <div className={cardClass(s.status)} key={s.id}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                      <div className="sheltertitle">{s.name}</div>
                      <span className={pillClass(s.status)}>
                        {s.status === 'available' ? 'Available' : s.status === 'limited' ? 'Limited' : 'Full'}
                      </span>
                    </div>
                    <div className="address">{s.address}</div>

                    <div className="sheltermetrics" style={{ marginTop: 12 }}>
                      <div className="sm">
                        <strong>{s.distanceKm != null ? formatDistance(s.distanceKm) : '—'}</strong>
                        <small>Away</small>
                      </div>
                      <div className="sm">
                        <strong style={{ color: isAvailable ? 'var(--teal)' : 'inherit' }}>
                          {s.availableCapacity}
                        </strong>
                        <small>Spaces free</small>
                      </div>
                      <div className="sm">
                        <strong>{pct}%</strong>
                        <small>Occupied</small>
                      </div>
                      <div className="sm">
                        <strong style={{ color: isAvailable ? 'var(--teal)' : 'var(--muted)' }}>
                          {isAvailable ? '✓' : '—'}
                        </strong>
                        <small>{isAvailable ? 'Suitable' : 'Unavailable'}</small>
                      </div>
                    </div>

                    <div className={`progress-bar-wrap ${pct >= 100 ? 'danger' : pct >= 80 ? 'warn' : ''}`}>
                      <i style={{ width: `${Math.min(pct, 100)}%` }} />
                    </div>
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <Link
                      className="btn"
                      style={{ width: '100%', textAlign: 'center', display: 'block', padding: '9px 12px' }}
                      to={`/shelters/${s.id}${origin ? `?lat=${origin.latitude}&lon=${origin.longitude}` : ''}`}
                    >
                      View details
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        ))
      )}
    </div>
  );
}
