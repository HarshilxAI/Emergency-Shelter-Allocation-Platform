'use strict';

const { z } = require('zod');

const DISASTER_CODES = ['flood', 'earthquake', 'fire', 'cyclone', 'landslide', 'other'];
const PRIORITIES = ['critical', 'high', 'medium', 'low'];
const SHELTER_STATUSES = [
  'available', 'limited', 'full', 'closed',
  'potential', 'under_verification', 'registered', 'inactive'
];
const REQUEST_STATUSES = ['pending', 'allocated', 'fulfilled', 'cancelled'];
const FACILITY_CODES = [
  'medical', 'food', 'water', 'electricity', 'toilets',
  'women_friendly', 'child_friendly', 'accessibility', 'security', 'pet_friendly'
];
const FACILITY_CATEGORIES = ['registered_shelter', 'potential_facility'];
const FACILITY_TYPES = [
  'registered_shelter', 'government_school', 'community_hall',
  'sports_complex', 'public_auditorium', 'government_building', 'other'
];
const CAPACITY_TYPES = ['official', 'estimated'];

const latitude = z.coerce.number().min(-90).max(90);
const longitude = z.coerce.number().min(-180).max(180);

const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password is too long')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');

const email = z
  .string()
  .trim()
  .toLowerCase()
  .email('Enter a valid email address')
  .max(255);

// ---------------------------------------------------------------- auth
const registerSchema = z
  .object({
    name: z.string().trim().min(2, 'Name must be at least 2 characters').max(120),
    email,
    password,
    confirmPassword: z.string(),
    phone: z.string().trim().max(20).optional().or(z.literal('')),
    // Requesting the administrator role at sign-up requires a passkey the
    // server checks against ADMIN_PASSKEY. Omitting or failing it never
    // blocks registration — it just means the account is created as a
    // normal user instead.
    isAdmin: z.coerce.boolean().default(false),
    adminPasskey: z.string().max(200).optional().or(z.literal(''))
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword']
  });

const loginSchema = z
  .object({
    email: z.string().trim().toLowerCase().optional(),
    phone: z.string().trim().max(25).optional(),
    password: z.string().min(1, 'Password is required'),
    // Present only when the "log in as administrator" checkbox was used.
    // The server always requires this passkey for an account whose role is
    // already admin, regardless of what this flag says.
    adminPasskey: z.string().max(200).optional().or(z.literal(''))
  })
  .refine((d) => Boolean(d.email || d.phone), {
    message: 'Enter your email address or mobile number',
    path: ['email']
  });

const googleAuthSchema = z.object({
  credential: z.string().min(10, 'Google credential token is required'),
  role: z.enum(['user', 'admin']).optional().default('user'),
  adminPasskey: z.string().max(200).optional().or(z.literal(''))
});

const updateProfileSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  phone: z.string().trim().max(20).optional().or(z.literal(''))
});

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: password,
    confirmPassword: z.string()
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword']
  });

// ------------------------------------------------------ emergency request
const emergencyRequestSchema = z
  .object({
    latitude,
    longitude,
    locationSource: z.enum(['current', 'manual']).optional().default('current'),
    locationLabel: z.string().trim().max(300).optional().or(z.literal('')),
    disasterCode: z.enum(DISASTER_CODES, {
      errorMap: () => ({ message: 'Select a valid disaster type' })
    }),
    priority: z.enum(PRIORITIES, {
      errorMap: () => ({ message: 'Select a valid priority level' })
    }),
    totalPeople: z.coerce.number().int().min(1, 'At least one person is required').max(500),
    childrenCount: z.coerce.number().int().min(0).max(500).default(0),
    seniorCount: z.coerce.number().int().min(0).max(500).default(0),
    womenCount: z.coerce.number().int().min(0).max(500).default(0),
    disabledCount: z.coerce.number().int().min(0).max(500).default(0),
    otherDisasterLabel: z.string().trim().max(120).optional().or(z.literal('')),
    requiredFacilities: z.array(z.enum(FACILITY_CODES)).max(10).default([]),
    notes: z.string().trim().max(1000).optional().or(z.literal(''))
  })
  // Categories overlap by design (a woman can also be a senior), so the sum
  // is not constrained — but no single category may exceed the total.
  .refine((d) => d.childrenCount <= d.totalPeople, {
    message: 'Children cannot exceed the total number of people',
    path: ['childrenCount']
  })
  .refine((d) => d.seniorCount <= d.totalPeople, {
    message: 'Senior citizens cannot exceed the total number of people',
    path: ['seniorCount']
  })
  .refine((d) => d.womenCount <= d.totalPeople, {
    message: 'Women cannot exceed the total number of people',
    path: ['womenCount']
  })
  .refine((d) => d.disabledCount <= d.totalPeople, {
    message: 'Disabled people cannot exceed the total number of people',
    path: ['disabledCount']
  })
  .refine((d) => d.disasterCode !== 'other' || d.otherDisasterLabel, {
    message: 'Name the disaster when "Other" is selected',
    path: ['otherDisasterLabel']
  });

/** Preview scoring without persisting anything. */
const previewSchema = emergencyRequestSchema;

// --------------------------------------------------------------- shelters
const shelterBaseSchema = z.object({
  name: z.string().trim().min(3, 'Name must be at least 3 characters').max(160),
  description: z.string().trim().max(2000).optional().or(z.literal('')),
  address: z.string().trim().min(5, 'Address is required').max(500),
  city: z.string().trim().max(80).default('Bengaluru'),
  state: z.string().trim().max(80).default('Karnataka'),
  pincode: z.string().trim().max(10).optional().or(z.literal('')),
  latitude,
  longitude,
  totalCapacity: z.coerce.number().int().min(1, 'Capacity must be at least 1').max(100000),
  currentOccupancy: z.coerce.number().int().min(0).max(100000).default(0),
  status: z.enum(SHELTER_STATUSES).optional(),
  contactName: z.string().trim().max(120).optional().or(z.literal('')),
  contactPhone: z.string().trim().max(20).optional().or(z.literal('')),
  emergencyPhone: z.string().trim().max(20).optional().or(z.literal('')),
  isWheelchairAccessible: z.coerce.boolean().default(false),
  accessibilityNotes: z.string().trim().max(1000).optional().or(z.literal('')),
  isActive: z.coerce.boolean().default(true),
  facilities: z.array(z.enum(FACILITY_CODES)).max(10).default([]),
  disasterSupport: z
    .array(
      z.object({
        disasterCode: z.enum(DISASTER_CODES),
        suitabilityLevel: z.coerce.number().min(0).max(1)
      })
    )
    .max(10)
    .default([]),

  // ---- Facility model (registered shelter vs. potential facility) ----
  facilityCategory: z.enum(FACILITY_CATEGORIES).default('registered_shelter'),
  facilityType: z.enum(FACILITY_TYPES).default('registered_shelter'),
  cityId: z.coerce.number().int().positive().optional(),

  // ---- Capacity typing ----
  capacityType: z.enum(CAPACITY_TYPES).default('official'),
  capacityMethod: z.string().trim().max(40).optional().or(z.literal('')),
  floorAreaSqm: z.coerce.number().positive().max(1000000).optional(),

  // ---- Data source & verification ----
  dataSource: z.string().trim().max(60).default('DEMO_DATASET'),
  sourceReference: z.string().trim().max(2000).optional().or(z.literal(''))
});

// capacityMethod is required once capacityType is 'estimated' — applied to
// both create and update below rather than baked into the base schema, so
// updateShelterSchema can still call .partial() on a plain ZodObject.
function requireEstimateMethod(schema) {
  return schema.refine(
    (d) => d.capacityType !== 'estimated' || d.capacityMethod,
    { message: 'An estimated capacity needs a method (e.g. area-based)', path: ['capacityMethod'] }
  );
}

const createShelterSchema = requireEstimateMethod(shelterBaseSchema).refine(
  (d) => d.currentOccupancy <= d.totalCapacity,
  { message: 'Occupancy cannot exceed total capacity', path: ['currentOccupancy'] }
);

const updateShelterSchema = requireEstimateMethod(shelterBaseSchema.partial()).refine(
  (d) =>
    d.currentOccupancy === undefined ||
    d.totalCapacity === undefined ||
    d.currentOccupancy <= d.totalCapacity,
  { message: 'Occupancy cannot exceed total capacity', path: ['currentOccupancy'] }
);

const occupancySchema = z.object({
  currentOccupancy: z.coerce.number().int().min(0).max(100000)
});

const shelterQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  status: z.enum(SHELTER_STATUSES).optional(),
  category: z.enum(FACILITY_CATEGORIES).optional(),
  disasterCode: z.enum(DISASTER_CODES).optional(),
  latitude: latitude.optional(),
  longitude: longitude.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  offset: z.coerce.number().int().min(0).default(0),
  includeInactive: z
    .union([z.boolean(), z.string()])
    .transform((v) => v === true || v === 'true')
    .default(false)
});

// ------------------------------------------------------------------ admin
const updateRequestStatusSchema = z.object({
  status: z.enum(REQUEST_STATUSES)
});

const updateUserSchema = z.object({
  role: z.enum(['user', 'admin']).optional(),
  isActive: z.coerce.boolean().optional()
});

const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  status: z.string().trim().max(30).optional(),
  priority: z.enum(PRIORITIES).optional()
});

// ---- Facility lifecycle (potential -> under_verification -> registered -> activated) ----
const verifyFacilitySchema = z.object({
  note: z.string().trim().max(500).optional().or(z.literal(''))
});

const activateFacilitySchema = z.object({
  totalCapacity: z.coerce.number().int().min(1, 'Capacity must be at least 1').max(100000).optional(),
  currentOccupancy: z.coerce.number().int().min(0).max(100000).optional(),
  note: z.string().trim().max(500).optional().or(z.literal(''))
});

const estimateCapacitySchema = z.object({
  floorAreaSqm: z.coerce.number().positive().max(1000000),
  areaPerPerson: z.coerce.number().positive().max(50).optional()
});

// ---- Allocation review (Keep allocation / Change shelter) ----
const reassignAllocationSchema = z.object({
  shelterId: z.coerce.number().int().positive(),
  note: z.string().trim().max(500).optional().or(z.literal(''))
});

const confirmAllocationSchema = z.object({
  note: z.string().trim().max(500).optional().or(z.literal(''))
});

const historyQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
  search: z.string().trim().max(100).optional(),
  action: z.string().trim().max(50).optional(),
  fromDate: z.string().trim().max(30).optional(),
  toDate: z.string().trim().max(30).optional()
});

module.exports = {
  DISASTER_CODES,
  PRIORITIES,
  SHELTER_STATUSES,
  REQUEST_STATUSES,
  FACILITY_CODES,
  FACILITY_CATEGORIES,
  FACILITY_TYPES,
  CAPACITY_TYPES,
  registerSchema,
  loginSchema,
  googleAuthSchema,
  updateProfileSchema,
  changePasswordSchema,
  emergencyRequestSchema,
  previewSchema,
  createShelterSchema,
  updateShelterSchema,
  occupancySchema,
  shelterQuerySchema,
  updateRequestStatusSchema,
  verifyFacilitySchema,
  activateFacilitySchema,
  estimateCapacitySchema,
  reassignAllocationSchema,
  confirmAllocationSchema,
  historyQuerySchema,
  updateUserSchema,
  paginationSchema
};
