import { useState } from 'react';
import { Link } from 'react-router-dom';
import { StatusBadge } from './Ui';
import { formatDistance, facilityLabel, occupancyPercent } from '../utils/format';
import { SCORE_FACTOR_LABELS } from '../utils/constants';

/** Colour the meter by strength so weak components are visible at a glance. */
function meterClass(score) {
  if (score >= 75) return 'meter__fill meter__fill-strong';
  if (score >= 45) return 'meter__fill';
  if (score >= 25) return 'meter__fill meter__fill-weak';
  return 'meter__fill meter__fill-poor';
}

function ScoreBreakdown({ breakdown }) {
  const rows = Object.entries(breakdown || {});
  if (!rows.length) return null;

  return (
    <div className="breakdown">
      {rows.map(([key, part]) => (
        <div className="breakdown-row" key={key}>
          <span className="breakdown-row__name">{SCORE_FACTOR_LABELS[key] || key}</span>
          <span className="meter">
            <span className={meterClass(part.score)} style={{ width: `${part.score}%` }} />
          </span>
          <span className="breakdown-row__value">
            {Math.round(part.score)}% &middot; wt {Math.round(part.weight)}%
          </span>
        </div>
      ))}
      <p className="tiny muted" style={{ margin: '4px 0 0' }}>
        The overall score is the weighted average of these five factors. Weights shift with the
        emergency priority you selected.
      </p>
    </div>
  );
}

/**
 * A ranked shelter result. The left status rail carries availability, the
 * numeral carries rank (a genuine sequence), and requested facilities are
 * shown as met or missing so a gap is as visible as a match.
 */
export default function ShelterRecord({
  shelter,
  requestedFacilities = [],
  facilityCatalogue = [],
  onShowRoute,
  isSelected,
  originForLink
}) {
  const [showWhy, setShowWhy] = useState(false);

  const matched = shelter.matchedFacilities || [];
  const missing = shelter.missingFacilities || [];
  // When no facilities were requested, show what the shelter offers instead
  // of an empty strip.
  const extras = requestedFacilities.length
    ? (shelter.facilities || []).filter((f) => !matched.includes(f) && !missing.includes(f))
    : shelter.facilities || [];

  const occupancy = occupancyPercent(shelter.currentOccupancy, shelter.totalCapacity);
  const detailQuery = originForLink
    ? `?lat=${originForLink.latitude}&lon=${originForLink.longitude}`
    : '';

  return (
    <article
      className={`railed rail-${shelter.status} shelter-record`}
      style={isSelected ? { borderColor: 'var(--action)', boxShadow: '0 0 0 2px var(--action-wash)' } : undefined}
    >
      <div className="shelter-record__top">
        {shelter.rank != null && (
          <span className={`rank-mark${shelter.rank === 1 ? ' rank-mark-top' : ''}`}>
            {shelter.rank}
          </span>
        )}

        <div>
          <h3 className="shelter-record__name">{shelter.name}</h3>
          <div className="shelter-record__addr">{shelter.address}</div>
          <div className="row" style={{ gap: 8, marginTop: 8 }}>
            <StatusBadge status={shelter.status} />
            {shelter.rank === 1 && <span className="badge badge-available">Best match</span>}
            {shelter.isWheelchairAccessible && (
              <span className="badge badge-neutral">Wheelchair accessible</span>
            )}
          </div>
        </div>

        {shelter.suitabilityScore != null && (
          <div className="score-mark">
            <div className="score-mark__value">{Math.round(shelter.suitabilityScore)}</div>
            <div className="score-mark__label">suitability / 100</div>
          </div>
        )}
      </div>

      <div className="metrics">
        <div className="metric">
          <div className="metric__value">{formatDistance(shelter.distanceKm)}</div>
          <div className="metric__label">Straight-line distance</div>
        </div>
        <div className="metric">
          <div className="metric__value">{shelter.availableCapacity}</div>
          <div className="metric__label">Spaces available</div>
        </div>
        <div className="metric">
          <div className="metric__value">
            {shelter.currentOccupancy}
            <span className="muted" style={{ fontSize: '0.85rem', fontWeight: 400 }}>
              {' '}
              / {shelter.totalCapacity}
            </span>
          </div>
          <div className="metric__label">Current occupancy</div>
        </div>
        {shelter.disasterSuitability != null && (
          <div className="metric">
            <div className="metric__value">{Math.round(shelter.disasterSuitability * 100)}%</div>
            <div className="metric__label">Disaster suitability</div>
          </div>
        )}
      </div>

      <div className="capacity-bar" aria-hidden="true">
        <span
          className={`capacity-bar__fill${occupancy >= 100 ? ' is-full' : occupancy >= 80 ? ' is-tight' : ''}`}
          style={{ width: `${occupancy}%` }}
        />
      </div>

      {(matched.length > 0 || missing.length > 0 || extras.length > 0) && (
        <div className="chips">
          {matched.map((f) => (
            <span className="chip chip-met" key={`m-${f}`}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M20 6 9 17l-5-5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {facilityLabel(f, facilityCatalogue)}
            </span>
          ))}
          {missing.map((f) => (
            <span className="chip chip-missing" key={`x-${f}`} title="You asked for this; it is not available here">
              {facilityLabel(f, facilityCatalogue)}
            </span>
          ))}
          {extras.slice(0, 6).map((f) => (
            <span className="chip" key={`e-${f}`}>
              {facilityLabel(f, facilityCatalogue)}
            </span>
          ))}
        </div>
      )}

      {missing.length > 0 && (
        <p className="tiny" style={{ color: 'var(--signal)', margin: 0 }}>
          This shelter does not provide {missing.length} of the facilities you asked for. It is
          still listed because it can take your group safely.
        </p>
      )}

      <div className="row" style={{ gap: 10 }}>
        <Link className="btn btn-sm btn-secondary" to={`/shelters/${shelter.id}${detailQuery}`}>
          View details
        </Link>
        {onShowRoute && (
          <button type="button" className="btn btn-sm btn-primary" onClick={() => onShowRoute(shelter)}>
            Get route
          </button>
        )}
        {shelter.breakdown && Object.keys(shelter.breakdown).length > 0 && (
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            aria-expanded={showWhy}
            onClick={() => setShowWhy((v) => !v)}
          >
            {showWhy ? 'Hide scoring' : 'Why this score?'}
          </button>
        )}
        {shelter.emergencyPhone && (
          <a className="btn btn-sm btn-ghost" href={`tel:${shelter.emergencyPhone}`}>
            Call {shelter.emergencyPhone}
          </a>
        )}
      </div>

      {showWhy && (
        <div style={{ borderTop: '1px solid var(--line-soft)', paddingTop: 16 }}>
          <ScoreBreakdown breakdown={shelter.breakdown} />
        </div>
      )}
    </article>
  );
}
