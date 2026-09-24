/**
 * Thin fetch wrapper around the REST API.
 * Centralises auth headers, JSON handling and error normalisation so
 * every page can rely on the same error shape.
 */

const BASE = import.meta.env.VITE_API_URL || '/api';
const TOKEN_KEY = 'esap.token';

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable (private mode) — the session simply won't persist */
  }
}

/** Error carrying the HTTP status and any per-field messages from the API. */
export class ApiError extends Error {
  constructor(message, { status, code, details } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details || null;
  }
}

/** Fired when a token is rejected, so AuthContext can clear the session. */
const SESSION_EXPIRED_EVENT = 'esap:session-expired';

export function onSessionExpired(handler) {
  window.addEventListener(SESSION_EXPIRED_EVENT, handler);
  return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handler);
}

async function request(method, path, { body, signal, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = auth ? getToken() : null;
  if (token) headers.Authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    // Distinguish "server unreachable" from "server said no" — the user
    // needs different advice in each case.
    throw new ApiError(
      'Cannot reach the server. Check that the backend is running and try again.',
      { status: 0, code: 'NETWORK' }
    );
  }

  if (response.status === 204) return null;

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const error = payload?.error || {};
    if (response.status === 401 && token) {
      window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
    }
    throw new ApiError(error.message || `Request failed (${response.status})`, {
      status: response.status,
      code: error.code,
      details: error.details
    });
  }

  return payload?.data ?? payload;
}

export const api = {
  get: (path, opts) => request('GET', path, opts),
  post: (path, body, opts) => request('POST', path, { ...opts, body }),
  patch: (path, body, opts) => request('PATCH', path, { ...opts, body }),
  del: (path, opts) => request('DELETE', path, opts)
};

/* --------------------------------------------------------- endpoints */

export const authApi = {
  config: () => api.get('/auth/config', { auth: false }),
  register: (data) => api.post('/auth/register', data, { auth: false }),
  login: (data) => api.post('/auth/login', data, { auth: false }),
  google: (data) => api.post('/auth/google', data, { auth: false }),
  me: () => api.get('/auth/me'),
  updateProfile: (data) => api.patch('/auth/me', data),
  changePassword: (data) => api.post('/auth/change-password', data)
};

export const shelterApi = {
  referenceData: () => api.get('/shelters/reference-data', { auth: false }),
  list: (params = {}) => api.get(`/shelters${toQuery(params)}`),
  get: (id, params = {}) => api.get(`/shelters/${id}${toQuery(params)}`)
};

export const requestApi = {
  create: (data) => api.post('/emergency-requests', data),
  list: (params = {}) => api.get(`/emergency-requests${toQuery(params)}`),
  get: (id) => api.get(`/emergency-requests/${id}`),
  cancel: (id) => api.post(`/emergency-requests/${id}/cancel`),
  preview: (data) => api.post('/recommendations/preview', data)
};

export const adminApi = {
  stats: () => api.get('/admin/stats'),
  listShelters: (params = {}) => api.get(`/admin/shelters${toQuery(params)}`),
  createShelter: (data) => api.post('/admin/shelters', data),
  updateShelter: (id, data) => api.patch(`/admin/shelters/${id}`, data),
  updateOccupancy: (id, currentOccupancy) =>
    api.patch(`/admin/shelters/${id}/occupancy`, { currentOccupancy }),
  deactivateShelter: (id) => api.post(`/admin/shelters/${id}/deactivate`),
  deleteShelter: (id) => api.del(`/admin/shelters/${id}`),
  // Potential-facility lifecycle
  markUnderVerification: (id, note) => api.post(`/admin/shelters/${id}/under-verification`, { note }),
  verifyFacility: (id, note) => api.post(`/admin/shelters/${id}/verify`, { note }),
  activateFacility: (id, data) => api.post(`/admin/shelters/${id}/activate`, data),
  estimateCapacity: (floorAreaSqm, areaPerPerson) =>
    api.post('/admin/shelters/estimate-capacity', { floorAreaSqm, areaPerPerson }),
  listRequests: (params = {}) => api.get(`/admin/requests${toQuery(params)}`),
  getRequest: (id) => api.get(`/admin/requests/${id}`),
  updateRequestStatus: (id, status) => api.patch(`/admin/requests/${id}/status`, { status }),
  // Allocation review: Keep / Change shelter
  confirmAllocation: (id, note) => api.post(`/admin/requests/${id}/confirm`, { note }),
  reassignAllocation: (id, shelterId, note) =>
    api.post(`/admin/requests/${id}/reassign`, { shelterId, note }),
  // Audit history
  listHistory: (params = {}) => api.get(`/admin/history${toQuery(params)}`),
  historyExportUrl: (params = {}) => `${BASE}/admin/history/export${toQuery(params)}`,
  listUsers: (params = {}) => api.get(`/admin/users${toQuery(params)}`),
  updateUser: (id, data) => api.patch(`/admin/users/${id}`, data)
};

function toQuery(params) {
  const usable = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== null && v !== ''
  );
  if (!usable.length) return '';
  return `?${new URLSearchParams(usable).toString()}`;
}
