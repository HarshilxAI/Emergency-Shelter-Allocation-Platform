import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { shelterApi, requestApi } from '../api/client';
import { getCurrentPosition } from '../utils/geo';
import { LocationPicker } from '../components/Maps';
import { Alert, Spinner } from '../components/Ui';
import { useToast } from '../context/ToastContext';

const DISASTER_OPTIONS = [
  { code: 'flood', label: 'Flood' },
  { code: 'earthquake', label: 'Earthquake' },
  { code: 'fire', label: 'Fire' },
  { code: 'cyclone', label: 'Cyclone' },
  { code: 'landslide', label: 'Landslide' },
  { code: 'other', label: 'Other' }
];

const URGENCY_OPTIONS = [
  { code: 'critical', label: 'Critical', hint: 'Immediate danger; prioritises closest reachable shelter' },
  { code: 'high', label: 'High', hint: 'Severe risk; needs safe allocation quickly' },
  { code: 'medium', label: 'Medium', hint: 'Moderate hazard; balances distance and facilities' },
  { code: 'low', label: 'Low', hint: 'Precautionary evacuation; allows better-equipped shelters further away' }
];

const FACILITY_OPTIONS = [
  { code: 'water', label: 'Drinking Water' },
  { code: 'food', label: 'Food' },
  { code: 'medical', label: 'Medical Assistance' },
  { code: 'toilets', label: 'Toilets' },
  { code: 'accessibility', label: 'Accessibility Support' },
  { code: 'child_friendly', label: 'Child-Friendly Facilities' },
  { code: 'electricity', label: 'Electricity' },
  { code: 'pet_friendly', label: 'Pet Friendly' },
  { code: 'security', label: 'Security' },
  { code: 'women_friendly', label: 'Women-Friendly Facilities' }
];

const PRESET_LOCATIONS = [
  { label: 'Koramangala 4th Block, Bengaluru', lat: 12.9352, lng: 77.6245 },
  { label: 'Indiranagar 100ft Road, Bengaluru', lat: 12.9784, lng: 77.6408 },
  { label: 'Whitefield EPIP Zone, Bengaluru', lat: 12.9698, lng: 77.7500 },
  { label: 'Yelahanka New Town, Bengaluru', lat: 13.0990, lng: 77.5870 },
  { label: 'Majestic Kempegowda, Bengaluru', lat: 12.9767, lng: 77.5713 },
  { label: 'Rajajinagar, Bengaluru', lat: 12.9882, lng: 77.5548 },
  { label: 'Jayanagar 4th Block, Bengaluru', lat: 12.9298, lng: 77.5828 }
];

export default function NewRequest() {
  const navigate = useNavigate();
  const toast = useToast();

  // Location model state: 'current' vs 'manual'
  const [locationMode, setLocationMode] = useState('current'); // 'current' | 'manual'
  const [position, setPosition] = useState(null);
  const [locationLabel, setLocationLabel] = useState('');
  const [locatingState, setLocatingState] = useState({ busy: false, error: null });

  // Form state
  const [disasterCode, setDisasterCode] = useState('flood');
  const [otherDisasterLabel, setOtherDisasterLabel] = useState('');
  const [priority, setPriority] = useState('high');
  const [totalPeople, setTotalPeople] = useState('1');
  const [childrenCount, setChildrenCount] = useState('0');
  const [seniorCount, setSeniorCount] = useState('0');
  const [womenCount, setWomenCount] = useState('0');
  const [disabledCount, setDisabledCount] = useState('0');
  const [selectedFacilities, setSelectedFacilities] = useState(['water', 'food']);
  const [notes, setNotes] = useState('');

  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Obtain current device location
  const locate = useCallback(async () => {
    setLocatingState({ busy: true, error: null });
    try {
      const pos = await getCurrentPosition();
      setPosition(pos);
      setFieldErrors((e) => ({ ...e, position: undefined }));
      setLocatingState({ busy: false, error: null });
    } catch (err) {
      setLocatingState({ busy: false, error: err.message || 'Unable to access device location.' });
    }
  }, []);

  // When switching to 'current', query device location once
  const handleSelectCurrentLocation = () => {
    setLocationMode('current');
    locate();
  };

  // When switching to 'manual', clear auto-obtained coordinates so user sets Location B
  const handleSelectManualLocation = () => {
    setLocationMode('manual');
    setLocatingState({ busy: false, error: null });
    if (!position || locationMode === 'current') {
      // Default to Bengaluru central area if no pin yet set
      setPosition({ latitude: 12.9716, longitude: 77.5946 });
      setLocationLabel('Bengaluru City Center');
    }
  };

  // Initialize on mount
  useEffect(() => {
    locate();
  }, [locate]);

  const selectPresetLocation = (preset) => {
    setPosition({ latitude: preset.lat, longitude: preset.lng });
    setLocationLabel(preset.label);
    setFieldErrors((e) => ({ ...e, position: undefined }));
  };

  const toggleFacility = (code) => {
    setSelectedFacilities((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  const asInt = (v) => {
    const n = Number.parseInt(v, 10);
    return Number.isFinite(n) ? n : 0;
  };

  const validate = () => {
    const errs = {};
    if (!position || !Number.isFinite(position.latitude) || !Number.isFinite(position.longitude)) {
      errs.position = 'Set an emergency location on the map or use your current location';
    }

    const total = asInt(totalPeople);
    if (total < 1) errs.totalPeople = 'At least 1 person is required';
    if (total > 500) errs.totalPeople = 'Maximum 500 people per request';

    if (asInt(childrenCount) > total) errs.childrenCount = 'Cannot exceed total people';
    if (asInt(seniorCount) > total) errs.seniorCount = 'Cannot exceed total people';
    if (asInt(womenCount) > total) errs.womenCount = 'Cannot exceed total people';
    if (asInt(disabledCount) > total) errs.disabledCount = 'Cannot exceed total people';

    if (disasterCode === 'other' && !otherDisasterLabel.trim()) {
      errs.otherDisasterLabel = 'Please specify the name of the disaster';
    }

    return errs;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError(null);

    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setSubmitting(true);
    try {
      const data = await requestApi.create({
        latitude: Number(position.latitude.toFixed(6)),
        longitude: Number(position.longitude.toFixed(6)),
        locationSource: locationMode, // 'current' | 'manual'
        locationLabel: locationLabel.trim() || (locationMode === 'current' ? 'Current GPS Location' : 'Manual Map Pin'),
        disasterCode,
        otherDisasterLabel: disasterCode === 'other' ? otherDisasterLabel.trim() : undefined,
        priority,
        totalPeople: asInt(totalPeople),
        childrenCount: asInt(childrenCount),
        seniorCount: asInt(seniorCount),
        womenCount: asInt(womenCount),
        disabledCount: asInt(disabledCount),
        requiredFacilities: selectedFacilities,
        notes: notes.trim() || undefined
      });

      const count = data.request.recommendations?.length || 0;
      if (count > 0) {
        toast.success(`${count} suitable ${count === 1 ? 'shelter' : 'shelters'} evaluated & ranked`);
      }
      navigate(`/requests/${data.request.id}`);
    } catch (err) {
      if (err.details) setFieldErrors(err.details);
      setFormError(err.message || 'Failed to submit emergency request.');
      setSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '36px 20px 72px' }}>
      <div className="page-head" style={{ marginBottom: 24 }}>
        <div>
          <div className="eyebrow">Emergency Request</div>
          <h1 style={{ fontSize: '2.1rem', margin: '4px 0 8px' }}>Find emergency shelter</h1>
          <p style={{ margin: 0, color: 'var(--ink-500)', fontSize: 14 }}>
            Specify the emergency location and your group requirements. Unsuitable shelters are
            filtered out before remaining shelters are scored and ranked.
          </p>
        </div>
      </div>

      {formError && (
        <div style={{ marginBottom: 20 }}>
          <Alert tone="error">{formError}</Alert>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate>
        {/* ------------------------------------------------ 1. LOCATION */}
        <section className="panel" style={{ marginBottom: 22 }}>
          <div className="panel-head" style={{ padding: '0 0 16px 0', borderBottom: '1px solid var(--border)' }}>
            <div>
              <h3 style={{ margin: '0 0 4px', fontSize: 18 }}>1. Request Location</h3>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-500)' }}>
                Choose whether to use your device location or enter a separate emergency location manually.
              </p>
            </div>
          </div>

          <div style={{ paddingTop: 18 }}>
            {/* Segmented Control */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 2,
                background: 'var(--border)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                padding: 3,
                marginBottom: 16
              }}
            >
              <button
                type="button"
                className={`btn ${locationMode === 'current' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ borderRadius: 'var(--radius)', height: 40 }}
                onClick={handleSelectCurrentLocation}
              >
                {locatingState.busy ? <Spinner light={locationMode === 'current'} /> : '📍 Use my current location'}
              </button>
              <button
                type="button"
                className={`btn ${locationMode === 'manual' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ borderRadius: 'var(--radius)', height: 40 }}
                onClick={handleSelectManualLocation}
              >
                🗺️ Enter location manually
              </button>
            </div>

            {locationMode === 'current' && locatingState.error && (
              <div style={{ marginBottom: 16 }}>
                <Alert tone="warn" title="Location access guidance">
                  {locatingState.error} You can drop a pin on the map or use manual location.
                </Alert>
              </div>
            )}

            {locationMode === 'manual' && (
              <div style={{ marginBottom: 16, background: 'var(--surface-raised)', padding: 14, borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 8, color: 'var(--ink)' }}>
                  Quick select prominent area:
                </label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {PRESET_LOCATIONS.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      className="btn btn-secondary"
                      style={{
                        fontSize: 12,
                        padding: '6px 10px',
                        background: locationLabel === preset.label ? 'var(--sunken)' : undefined,
                        borderColor: locationLabel === preset.label ? 'var(--primary)' : undefined
                      }}
                      onClick={() => selectPresetLocation(preset)}
                    >
                      {preset.label.split(',')[0]}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Interactive Leaflet Map */}
            <LocationPicker
              value={position}
              onChange={(p) => {
                setPosition(p);
                setFieldErrors((e) => ({ ...e, position: undefined }));
                setLocatingState({ busy: false, error: null });
              }}
              busy={locatingState.busy}
            />

            {fieldErrors.position && (
              <span className="field-hint" style={{ color: 'var(--danger)', marginTop: 8, display: 'block' }}>
                {fieldErrors.position}
              </span>
            )}

            <div style={{ marginTop: 16 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
                Location address or landmark label
              </label>
              <input
                type="text"
                placeholder={locationMode === 'current' ? 'e.g. My GPS location' : 'e.g. Koramangala 4th Block, Bengaluru'}
                value={locationLabel}
                onChange={(e) => setLocationLabel(e.target.value)}
                style={{
                  width: '100%',
                  height: 42,
                  border: '1px solid var(--border)',
                  background: 'var(--surface)',
                  color: 'var(--ink)',
                  padding: '0 12px',
                  borderRadius: 'var(--radius)',
                  font: 'inherit'
                }}
              />
              <span style={{ fontSize: 11, color: 'var(--ink-500)', display: 'block', marginTop: 4 }}>
                {position
                  ? `Active coordinates: ${position.latitude.toFixed(5)}, ${position.longitude.toFixed(5)} (${locationMode === 'current' ? 'Device GPS' : 'Manual Request Location'})`
                  : 'Coordinates not yet set'}
              </span>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------ 2. DISASTER & URGENCY */}
        <section className="panel" style={{ marginBottom: 22 }}>
          <div className="panel-head" style={{ padding: '0 0 16px 0', borderBottom: '1px solid var(--border)' }}>
            <div>
              <h3 style={{ margin: '0 0 4px', fontSize: 18 }}>2. Disaster & Urgency</h3>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-500)' }}>
                The disaster hazard determines structural suitability; urgency level tunes distance vs facility weighting.
              </p>
            </div>
          </div>

          <div style={{ paddingTop: 18, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
                Disaster Hazard
              </label>
              <select
                value={disasterCode}
                onChange={(e) => setDisasterCode(e.target.value)}
                style={{
                  width: '100%',
                  height: 42,
                  border: '1px solid var(--border)',
                  background: 'var(--surface)',
                  color: 'var(--ink)',
                  padding: '0 12px',
                  borderRadius: 'var(--radius)',
                  font: 'inherit'
                }}
              >
                {DISASTER_OPTIONS.map((opt) => (
                  <option key={opt.code} value={opt.code}>
                    {opt.label}
                  </option>
                ))}
              </select>

              {disasterCode === 'other' && (
                <div style={{ marginTop: 12 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
                    Name of disaster *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Chemical spill evacuation"
                    value={otherDisasterLabel}
                    onChange={(e) => {
                      setOtherDisasterLabel(e.target.value);
                      setFieldErrors((errs) => ({ ...errs, otherDisasterLabel: undefined }));
                    }}
                    style={{
                      width: '100%',
                      height: 42,
                      border: '1px solid var(--border)',
                      background: 'var(--surface)',
                      color: 'var(--ink)',
                      padding: '0 12px',
                      borderRadius: 'var(--radius)',
                      font: 'inherit'
                    }}
                  />
                  {fieldErrors.otherDisasterLabel && (
                    <span className="field-hint" style={{ color: 'var(--danger)', marginTop: 4, display: 'block' }}>
                      {fieldErrors.otherDisasterLabel}
                    </span>
                  )}
                </div>
              )}
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
                Urgency Level
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                style={{
                  width: '100%',
                  height: 42,
                  border: '1px solid var(--border)',
                  background: 'var(--surface)',
                  color: 'var(--ink)',
                  padding: '0 12px',
                  borderRadius: 'var(--radius)',
                  font: 'inherit'
                }}
              >
                {URGENCY_OPTIONS.map((opt) => (
                  <option key={opt.code} value={opt.code}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <span style={{ fontSize: 11, color: 'var(--ink-500)', display: 'block', marginTop: 6 }}>
                {URGENCY_OPTIONS.find((o) => o.code === priority)?.hint}
              </span>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------ 3. PEOPLE & VULNERABILITY */}
        <section className="panel" style={{ marginBottom: 22 }}>
          <div className="panel-head" style={{ padding: '0 0 16px 0', borderBottom: '1px solid var(--border)' }}>
            <div>
              <h3 style={{ margin: '0 0 4px', fontSize: 18 }}>3. Group Composition</h3>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-500)' }}>
                Categories may overlap (e.g. a senior woman with disability). Enter each category that applies.
              </p>
            </div>
          </div>

          <div style={{ paddingTop: 18 }}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
                Total number of people *
              </label>
              <input
                type="number"
                min="1"
                max="500"
                value={totalPeople}
                onChange={(e) => {
                  setTotalPeople(e.target.value.replace(/[^0-9]/g, ''));
                  setFieldErrors((errs) => ({ ...errs, totalPeople: undefined }));
                }}
                style={{
                  width: '100%',
                  maxWidth: 240,
                  height: 42,
                  border: '1px solid var(--border)',
                  background: 'var(--surface)',
                  color: 'var(--ink)',
                  padding: '0 12px',
                  borderRadius: 'var(--radius)',
                  font: 'inherit'
                }}
              />
              {fieldErrors.totalPeople && (
                <span className="field-hint" style={{ color: 'var(--danger)', marginTop: 4, display: 'block' }}>
                  {fieldErrors.totalPeople}
                </span>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
                  Children
                </label>
                <input
                  type="number"
                  min="0"
                  value={childrenCount}
                  onChange={(e) => setChildrenCount(e.target.value.replace(/[^0-9]/g, ''))}
                  style={{
                    width: '100%',
                    height: 42,
                    border: '1px solid var(--border)',
                    background: 'var(--surface)',
                    color: 'var(--ink)',
                    padding: '0 12px',
                    borderRadius: 'var(--radius)',
                    font: 'inherit'
                  }}
                />
                {fieldErrors.childrenCount && (
                  <span className="field-hint" style={{ color: 'var(--danger)', fontSize: 11 }}>
                    {fieldErrors.childrenCount}
                  </span>
                )}
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
                  Senior citizens
                </label>
                <input
                  type="number"
                  min="0"
                  value={seniorCount}
                  onChange={(e) => setSeniorCount(e.target.value.replace(/[^0-9]/g, ''))}
                  style={{
                    width: '100%',
                    height: 42,
                    border: '1px solid var(--border)',
                    background: 'var(--surface)',
                    color: 'var(--ink)',
                    padding: '0 12px',
                    borderRadius: 'var(--radius)',
                    font: 'inherit'
                  }}
                />
                {fieldErrors.seniorCount && (
                  <span className="field-hint" style={{ color: 'var(--danger)', fontSize: 11 }}>
                    {fieldErrors.seniorCount}
                  </span>
                )}
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
                  Women
                </label>
                <input
                  type="number"
                  min="0"
                  value={womenCount}
                  onChange={(e) => setWomenCount(e.target.value.replace(/[^0-9]/g, ''))}
                  style={{
                    width: '100%',
                    height: 42,
                    border: '1px solid var(--border)',
                    background: 'var(--surface)',
                    color: 'var(--ink)',
                    padding: '0 12px',
                    borderRadius: 'var(--radius)',
                    font: 'inherit'
                  }}
                />
                {fieldErrors.womenCount && (
                  <span className="field-hint" style={{ color: 'var(--danger)', fontSize: 11 }}>
                    {fieldErrors.womenCount}
                  </span>
                )}
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
                  Disabled people
                </label>
                <input
                  type="number"
                  min="0"
                  value={disabledCount}
                  onChange={(e) => setDisabledCount(e.target.value.replace(/[^0-9]/g, ''))}
                  style={{
                    width: '100%',
                    height: 42,
                    border: '1px solid var(--border)',
                    background: 'var(--surface)',
                    color: 'var(--ink)',
                    padding: '0 12px',
                    borderRadius: 'var(--radius)',
                    font: 'inherit'
                  }}
                />
                {fieldErrors.disabledCount && (
                  <span className="field-hint" style={{ color: 'var(--danger)', fontSize: 11 }}>
                    {fieldErrors.disabledCount}
                  </span>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------ 4. REQUIRED FACILITIES */}
        <section className="panel" style={{ marginBottom: 28 }}>
          <div className="panel-head" style={{ padding: '0 0 16px 0', borderBottom: '1px solid var(--border)' }}>
            <div>
              <h3 style={{ margin: '0 0 4px', fontSize: 18 }}>4. Required Facilities</h3>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-500)' }}>
                Select all facilities essential for your group. Critical facilities are weighted double by the ranking engine.
              </p>
            </div>
          </div>

          <div style={{ paddingTop: 18 }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                gap: 12,
                marginBottom: 18
              }}
            >
              {FACILITY_OPTIONS.map((f) => (
                <label
                  key={f.code}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 12px',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)',
                    background: selectedFacilities.includes(f.code) ? 'var(--surface-raised)' : 'var(--surface)',
                    cursor: 'pointer'
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedFacilities.includes(f.code)}
                    onChange={() => toggleFacility(f.code)}
                    style={{ accentColor: 'var(--primary)' }}
                  />
                  <span style={{ fontSize: 13, fontWeight: selectedFacilities.includes(f.code) ? 600 : 400 }}>
                    {f.label}
                  </span>
                </label>
              ))}
            </div>

            {priority === 'critical' && selectedFacilities.includes('medical') && (
              <div style={{ marginBottom: 16 }}>
                <Alert tone="info">
                  Critical medical requirement active: shelters lacking medical facilities will be eliminated from consideration entirely.
                </Alert>
              </div>
            )}

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
                Optional notes for emergency coordinators
              </label>
              <textarea
                rows={3}
                placeholder="e.g. Wheelchair ramp needed, diabetic member requiring refrigeration"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                style={{
                  width: '100%',
                  border: '1px solid var(--border)',
                  background: 'var(--surface)',
                  color: 'var(--ink)',
                  padding: '10px 12px',
                  borderRadius: 'var(--radius)',
                  font: 'inherit'
                }}
              />
            </div>
          </div>
        </section>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: 14 }}>
          <button
            type="submit"
            className="btn btn-red btn-lg"
            disabled={submitting}
            style={{ flex: 1 }}
          >
            {submitting ? <Spinner light /> : 'Find emergency shelters now'}
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-lg"
            onClick={() => navigate('/dashboard')}
            disabled={submitting}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
