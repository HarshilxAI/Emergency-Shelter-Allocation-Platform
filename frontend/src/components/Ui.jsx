import { SHELTER_STATUS, REQUEST_STATUS } from '../utils/constants';
import { titleCase } from '../utils/format';

/* Small presentational primitives shared across pages. */

export function Spinner({ size, light }) {
  return (
    <span
      className={`spinner${size === 'lg' ? ' spinner-lg' : ''}${light ? ' spinner-light' : ''}`}
      aria-hidden="true"
    />
  );
}

export function Loading({ label = 'Loading' }) {
  return (
    <div className="loading-block" role="status">
      <Spinner size="lg" />
      <span>{label}</span>
    </div>
  );
}

/** Placeholder that reserves the final layout so content arrival doesn't jump. */
export function SkeletonList({ count = 3 }) {
  return (
    <div aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="skeleton skeleton-card" />
      ))}
    </div>
  );
}

export function Alert({ tone = 'info', title, children, action }) {
  return (
    <div className={`alert alert-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <div style={{ flex: 1 }}>
        {title && <strong>{title}</strong>}
        {children}
      </div>
      {action}
    </div>
  );
}

/**
 * Error display that adapts to the failure type: a network error needs
 * different advice from a permission error.
 */
export function ErrorState({ error, onRetry }) {
  if (!error) return null;
  const isNetwork = error.code === 'NETWORK' || error.status === 0;
  return (
    <Alert
      tone="error"
      title={isNetwork ? 'Cannot reach the server' : 'Something went wrong'}
      action={
        onRetry && (
          <button type="button" className="btn btn-sm btn-secondary" onClick={onRetry}>
            Try again
          </button>
        )
      }
    >
      <span>{error.message}</span>
    </Alert>
  );
}

export function EmptyState({ title, children, action }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function StatusBadge({ status }) {
  const meta = SHELTER_STATUS[status] || { label: titleCase(status), tone: 'neutral' };
  return <span className={`badge badge-${meta.tone}`}>{meta.label}</span>;
}

export function RequestStatusBadge({ status }) {
  const meta = REQUEST_STATUS[status] || { label: titleCase(status), tone: 'neutral' };
  return <span className={`badge badge-${meta.tone}`}>{meta.label}</span>;
}

export function PriorityBadge({ priority }) {
  return <span className={`badge badge-${priority}`}>{titleCase(priority)}</span>;
}

/** Text input with label, hint and inline error, wired for accessibility. */
export function Field({
  label,
  name,
  type = 'text',
  value,
  onChange,
  error,
  hint,
  required,
  autoComplete,
  placeholder,
  min,
  max,
  disabled,
  as = 'input',
  children
}) {
  const id = `field-${name}`;
  const describedBy = [error ? `${id}-error` : null, hint ? `${id}-hint` : null]
    .filter(Boolean)
    .join(' ');

  const shared = {
    id,
    name,
    value: value ?? '',
    onChange,
    required,
    disabled,
    placeholder,
    'aria-invalid': error ? 'true' : undefined,
    'aria-describedby': describedBy || undefined
  };

  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
        {required && (
          <span aria-hidden="true" style={{ color: 'var(--signal)' }}>
            {' '}
            *
          </span>
        )}
      </label>
      {as === 'textarea' ? (
        <textarea {...shared} />
      ) : as === 'select' ? (
        <select {...shared}>{children}</select>
      ) : (
        <input {...shared} type={type} autoComplete={autoComplete} min={min} max={max} />
      )}
      {hint && (
        <div className="field-hint" id={`${id}-hint`}>
          {hint}
        </div>
      )}
      {error && (
        <div className="field-error" id={`${id}-error`} role="alert">
          {error}
        </div>
      )}
    </div>
  );
}

/** Confirmation dialog for destructive actions. */
export function ConfirmDialog({ title, message, confirmLabel = 'Confirm', tone = 'danger', busy, onConfirm, onCancel }) {
  return (
    <div
      className="overlay"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div className="modal">
        <h3>{title}</h3>
        <p>{message}</p>
        <div className="row" style={{ marginTop: 22, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className={`btn btn-${tone === 'danger' ? 'emergency' : 'primary'}`}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy && <Spinner light />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
