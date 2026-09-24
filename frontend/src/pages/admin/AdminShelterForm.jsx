import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { adminApi, shelterApi } from '../../api/client';
import { LocationPicker } from '../../components/Maps';
import { Field, Alert, Spinner, Loading, ErrorState } from '../../components/Ui';
import { useToast } from '../../context/ToastContext';
import { DISASTER_FALLBACK, FACILITY_FALLBACK, DEFAULT_CENTER } from '../../utils/constants';

const EMPTY = {
  name: '',
  description: '',
  address: '',
  city: 'Bengaluru',
  state: 'Karnataka',
  pincode: '',
  totalCapacity: 100,
  currentOccupancy: 0,
  contactName: '',
  contactPhone: '',
  emergencyPhone: '',
  isWheelchairAccessible: false,
  accessibilityNotes: '',
  isActive: true
};

/** Create and edit share one form; the route parameter decides the mode. */
export default function AdminShelterForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const toast = useToast();

  const [reference, setReference] = useState({
    disasterTypes: DISASTER_FALLBACK,
    facilities: FACILITY_FALLBACK
  });
  const [form, setForm] = useState(EMPTY);
  const [position, setPosition] = useState(
    isEdit ? null : { latitude: DEFAULT_CENTER.latitude, longitude: DEFAULT_CENTER.longitude }
  );
  const [facilities, setFacilities] = useState([]);
  const [disasterLevels, setDisasterLevels] = useState({});

  const [loading, setLoading] = useState(isEdit);
  const [loadError, setLoadError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    shelterApi
      .referenceData()
      .then((d) => d?.disasterTypes?.length && setReference(d))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!isEdit) return;
    let active = true;

    shelterApi
      .get(id)
      .then((data) => {
        if (!active) return;
        const s = data.shelter;
        setForm({
          name: s.name || '',
          description: s.description || '',
          address: s.address || '',
          city: s.city || 'Bengaluru',
          state: s.state || 'Karnataka',
          pincode: s.pincode || '',
          totalCapacity: s.totalCapacity,
          currentOccupancy: s.currentOccupancy,
          contactName: s.contactName || '',
          contactPhone: s.contactPhone || '',
          emergencyPhone: s.emergencyPhone || '',
          isWheelchairAccessible: s.isWheelchairAccessible,
          accessibilityNotes: s.accessibilityNotes || '',
          isActive: s.isActive
        });
        setPosition({ latitude: s.latitude, longitude: s.longitude });
        setFacilities(s.facilities || []);
        setDisasterLevels(
          Object.fromEntries(
            (s.disasterSupport || []).map((d) => [d.disasterCode, d.suitabilityLevel])
          )
        );
        setLoading(false);
      })
      .catch((err) => {
        if (active) {
          setLoadError(err);
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [id, isEdit]);

  const change = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((f) => ({ ...f, [name]: type === 'checkbox' ? checked : value }));
    setFieldErrors((errs) => ({ ...errs, [name]: undefined }));
  };

  const toggleFacility = (code) => {
    setFacilities((list) =>
      list.includes(code) ? list.filter((c) => c !== code) : [...list, code]
    );
  };

  const setDisasterLevel = (code, value) => {
    setDisasterLevels((levels) => {
      const next = { ...levels };
      if (value === '' || value === null) delete next[code];
      else next[code] = Number(value);
      return next;
    });
  };

  const asInt = (v) => {
    const n = Number.parseInt(v, 10);
    return Number.isFinite(n) ? n : 0;
  };

  const validate = () => {
    const errs = {};
    if (form.name.trim().length < 3) errs.name = 'Name must be at least 3 characters';
    if (form.address.trim().length < 5) errs.address = 'Enter a full address';
    if (!position) errs.position = 'Set the shelter location on the map';

    const capacity = asInt(form.totalCapacity);
    const occupancy = asInt(form.currentOccupancy);
    if (capacity < 1) errs.totalCapacity = 'Capacity must be at least 1';
    if (occupancy < 0) errs.currentOccupancy = 'Occupancy cannot be negative';
    if (occupancy > capacity) {
      errs.currentOccupancy = `Cannot exceed the capacity of ${capacity}`;
    }
    return errs;
  };

  const submit = async (e) => {
    e.preventDefault();
    setFormError(null);

    const errs = validate();
    if (Object.keys(errs).length) {
      setFieldErrors(errs);
      document.querySelector('[aria-invalid="true"]')?.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
      return;
    }

    const payload = {
      ...form,
      totalCapacity: asInt(form.totalCapacity),
      currentOccupancy: asInt(form.currentOccupancy),
      latitude: position.latitude,
      longitude: position.longitude,
      facilities,
      disasterSupport: Object.entries(disasterLevels).map(([disasterCode, suitabilityLevel]) => ({
        disasterCode,
        suitabilityLevel
      }))
    };

    setSaving(true);
    try {
      if (isEdit) {
        await adminApi.updateShelter(id, payload);
        toast.success(`${form.name} updated`);
      } else {
        await adminApi.createShelter(payload);
        toast.success(`${form.name} added`);
      }
      navigate('/admin/shelters');
    } catch (err) {
      if (err.details) setFieldErrors(err.details);
      setFormError(err.message);
      setSaving(false);
    }
  };

  if (loading) return <Loading label="Loading shelter" />;

  if (loadError) {
    return (
      <div className="shell page">
        <ErrorState error={loadError} />
        <div style={{ marginTop: 20 }}>
          <Link className="btn btn-secondary" to="/admin/shelters">
            Back to shelters
          </Link>
        </div>
      </div>
    );
  }

  const capacity = asInt(form.totalCapacity);
  const occupancy = asInt(form.currentOccupancy);
  const derivedFree = Math.max(capacity - occupancy, 0);
  const freeRatio = capacity > 0 ? derivedFree / capacity : 0;
  const derivedStatus =
    !form.isActive ? 'inactive' : freeRatio <= 0 ? 'full' : freeRatio < 0.2 ? 'limited' : 'available';

  return (
    <div className="shell-narrow page">
      <div className="page-head">
        <div>
          <h1 style={{ fontSize: '1.9rem' }}>{isEdit ? 'Edit shelter' : 'Add shelter'}</h1>
          <p>
            {isEdit
              ? 'Update this shelter’s details. Changes affect allocation immediately.'
              : 'Register a new shelter. It becomes eligible for allocation as soon as it is saved.'}
          </p>
        </div>
      </div>

      {formError && (
        <div style={{ marginBottom: 24 }}>
          <Alert tone="error" title="Could not save">
            {formError}
          </Alert>
        </div>
      )}

      <form onSubmit={submit} noValidate className="stack-lg">
        <section className="panel">
          <h3 style={{ marginBottom: 18 }}>Identity</h3>
          <Field
            label="Shelter name"
            name="name"
            value={form.name}
            onChange={change}
            error={fieldErrors.name}
            required
          />
          <Field
            label="Description"
            name="description"
            as="textarea"
            value={form.description}
            onChange={change}
            error={fieldErrors.description}
            hint="What kind of building it is and how it is normally used."
          />
          <Field
            label="Street address"
            name="address"
            value={form.address}
            onChange={change}
            error={fieldErrors.address}
            required
          />
          <div className="grid grid-3" style={{ gap: 16 }}>
            <Field label="City" name="city" value={form.city} onChange={change} error={fieldErrors.city} />
            <Field label="State" name="state" value={form.state} onChange={change} error={fieldErrors.state} />
            <Field
              label="PIN code"
              name="pincode"
              value={form.pincode}
              onChange={change}
              error={fieldErrors.pincode}
            />
          </div>
        </section>

        <section className="panel">
          <h3 style={{ marginBottom: 6 }}>Location</h3>
          <p className="small muted" style={{ marginBottom: 16 }}>
            Click the map or drag the pin. Coordinates drive every distance calculation.
          </p>
          <LocationPicker value={position} onChange={setPosition} />
          {fieldErrors.position && (
            <div className="field-error" role="alert" style={{ marginTop: 10 }}>
              {fieldErrors.position}
            </div>
          )}
        </section>

        <section className="panel">
          <h3 style={{ marginBottom: 18 }}>Capacity</h3>
          <div className="grid grid-2" style={{ gap: 16 }}>
            <Field
              label="Total capacity"
              name="totalCapacity"
              type="number"
              min="1"
              value={form.totalCapacity}
              onChange={change}
              error={fieldErrors.totalCapacity}
              required
            />
            <Field
              label="Current occupancy"
              name="currentOccupancy"
              type="number"
              min="0"
              value={form.currentOccupancy}
              onChange={change}
              error={fieldErrors.currentOccupancy}
            />
          </div>

          {/* Status is derived by the database, so it is previewed rather
              than offered as an editable field. */}
          <Alert tone="info">
            <span>
              This shelter will have <strong>{derivedFree}</strong> spaces available and status{' '}
              <strong>{derivedStatus}</strong>. Available capacity and status are calculated from
              these two numbers — they are never set by hand.
            </span>
          </Alert>
        </section>

        <section className="panel">
          <h3 style={{ marginBottom: 6 }}>Facilities</h3>
          <p className="small muted" style={{ marginBottom: 16 }}>
            Tick everything this shelter can genuinely provide. These are matched against what
            people ask for.
          </p>
          <div className="choice-grid">
            {reference.facilities.map((f) => (
              <label className="choice" key={f.code}>
                <input
                  type="checkbox"
                  checked={facilities.includes(f.code)}
                  onChange={() => toggleFacility(f.code)}
                />
                <span className="choice-dot" aria-hidden="true" />
                {f.label}
              </label>
            ))}
          </div>
        </section>

        <section className="panel">
          <h3 style={{ marginBottom: 6 }}>Disaster suitability</h3>
          <p className="small muted" style={{ marginBottom: 16 }}>
            How well this building serves each hazard. Leave a hazard unset if it has not been
            assessed. Anything below 30% is excluded from recommendations for that disaster.
          </p>
          <div className="stack">
            {reference.disasterTypes.map((d) => {
              const level = disasterLevels[d.code];
              const isSet = level !== undefined;
              return (
                <div className="row-between" key={d.code} style={{ gap: 12 }}>
                  <span style={{ minWidth: 110, fontWeight: 500, fontSize: '0.92rem' }}>
                    {d.label}
                  </span>
                  <div className="row" style={{ flex: 1, gap: 12, justifyContent: 'flex-end' }}>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="5"
                      value={isSet ? Math.round(level * 100) : 0}
                      onChange={(e) => setDisasterLevel(d.code, Number(e.target.value) / 100)}
                      aria-label={`${d.label} suitability`}
                      style={{ flex: 1, maxWidth: 240 }}
                    />
                    <span
                      className="num small"
                      style={{ minWidth: 44, textAlign: 'right', color: isSet ? 'var(--ink-900)' : 'var(--ink-300)' }}
                    >
                      {isSet ? `${Math.round(level * 100)}%` : 'unset'}
                    </span>
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      onClick={() => setDisasterLevel(d.code, isSet ? '' : 0.8)}
                    >
                      {isSet ? 'Clear' : 'Set'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="panel">
          <h3 style={{ marginBottom: 18 }}>Contact and accessibility</h3>
          <div className="grid grid-3" style={{ gap: 16 }}>
            <Field
              label="Coordinator name"
              name="contactName"
              value={form.contactName}
              onChange={change}
              error={fieldErrors.contactName}
            />
            <Field
              label="Contact phone"
              name="contactPhone"
              value={form.contactPhone}
              onChange={change}
              error={fieldErrors.contactPhone}
            />
            <Field
              label="Emergency phone"
              name="emergencyPhone"
              value={form.emergencyPhone}
              onChange={change}
              error={fieldErrors.emergencyPhone}
            />
          </div>

          <label className="choice" style={{ marginBottom: 16 }}>
            <input
              type="checkbox"
              name="isWheelchairAccessible"
              checked={form.isWheelchairAccessible}
              onChange={change}
            />
            <span className="choice-dot" aria-hidden="true" />
            Wheelchair accessible
          </label>

          <Field
            label="Accessibility notes"
            name="accessibilityNotes"
            as="textarea"
            value={form.accessibilityNotes}
            onChange={change}
            error={fieldErrors.accessibilityNotes}
            hint="Entrance type, floor access, assistance available."
          />

          <label className="choice">
            <input type="checkbox" name="isActive" checked={form.isActive} onChange={change} />
            <span className="choice-dot" aria-hidden="true" />
            Active — visible to users and eligible for allocation
          </label>
        </section>

        <div className="row" style={{ gap: 12 }}>
          <button type="submit" className="btn btn-lg btn-primary" disabled={saving}>
            {saving && <Spinner light />}
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add shelter'}
          </button>
          <Link className="btn btn-lg btn-secondary" to="/admin/shelters">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
