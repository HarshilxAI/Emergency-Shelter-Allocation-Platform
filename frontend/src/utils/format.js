/** Presentation helpers. No business logic — scoring lives on the server. */

export function formatDistance(km) {
  if (km === null || km === undefined || Number.isNaN(km)) return '—';
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(km < 10 ? 1 : 0)} km`;
}

export function formatScore(score) {
  if (score === null || score === undefined) return '—';
  return `${Math.round(score)}`;
}

export function formatDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function formatRelative(value) {
  if (!value) return '—';
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return '—';
  const diff = Date.now() - then;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} d ago`;
  return formatDateTime(value);
}

export function facilityLabel(code, catalogue = []) {
  const found = catalogue.find((f) => f.code === code);
  if (found) return found.label;
  return code.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

export function titleCase(value = '') {
  return String(value).replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

/** Occupancy percentage, guarded against a zero-capacity record. */
export function occupancyPercent(occupancy, capacity) {
  if (!capacity) return 0;
  return Math.min(100, Math.round((occupancy / capacity) * 100));
}
