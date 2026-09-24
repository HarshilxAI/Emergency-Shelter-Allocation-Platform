/** Shared display metadata. Codes must match the backend enums. */

export const PRIORITIES = [
  { code: 'critical', label: 'Critical', hint: 'Immediate danger to life' },
  { code: 'high', label: 'High', hint: 'Urgent, needs shelter within hours' },
  { code: 'medium', label: 'Medium', hint: 'Displaced but currently safe' },
  { code: 'low', label: 'Low', hint: 'Planning ahead or precautionary' }
];

export const SHELTER_STATUS = {
  available: { label: 'Available', tone: 'available' },
  limited: { label: 'Limited capacity', tone: 'limited' },
  full: { label: 'Full', tone: 'full' },
  closed: { label: 'Temporarily closed', tone: 'closed' },
  potential: { label: 'Potential facility', tone: 'potential' },
  under_verification: { label: 'Under verification', tone: 'under_verification' },
  registered: { label: 'Registered (not activated)', tone: 'registered' },
  inactive: { label: 'Inactive', tone: 'inactive' }
};

export const REQUEST_STATUS = {
  pending: { label: 'Awaiting allocation', tone: 'neutral' },
  allocated: { label: 'Shelter allocated', tone: 'action' },
  fulfilled: { label: 'Fulfilled', tone: 'available' },
  cancelled: { label: 'Cancelled', tone: 'closed' }
};

export const DISASTER_FALLBACK = [
  { code: 'flood', label: 'Flood' },
  { code: 'earthquake', label: 'Earthquake' },
  { code: 'fire', label: 'Fire' },
  { code: 'cyclone', label: 'Cyclone' },
  { code: 'landslide', label: 'Landslide' },
  { code: 'other', label: 'Other' }
];

export const FACILITY_FALLBACK = [
  { code: 'medical', label: 'Medical assistance', isCritical: true },
  { code: 'food', label: 'Food', isCritical: true },
  { code: 'water', label: 'Drinking water', isCritical: true },
  { code: 'toilets', label: 'Toilets', isCritical: true },
  { code: 'electricity', label: 'Electricity', isCritical: false },
  { code: 'women_friendly', label: 'Women-friendly facilities', isCritical: false },
  { code: 'child_friendly', label: 'Child-friendly facilities', isCritical: false },
  { code: 'accessibility', label: 'Accessibility support', isCritical: false },
  { code: 'security', label: 'Security', isCritical: false },
  { code: 'pet_friendly', label: 'Pet friendly', isCritical: false }
];

/** Bengaluru city centre — the map's default view for the demo dataset. */
export const DEFAULT_CENTER = { latitude: 12.9716, longitude: 77.5946 };

export const SCORE_FACTOR_LABELS = {
  distance: 'Distance',
  capacity: 'Capacity',
  facilities: 'Facilities',
  disaster: 'Disaster fit',
  readiness: 'Readiness'
};
