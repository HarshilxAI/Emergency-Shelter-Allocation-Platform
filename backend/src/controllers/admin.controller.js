'use strict';

const asyncHandler = require('../utils/asyncHandler');
const db = require('../config/database');
const ApiError = require('../utils/ApiError');
const shelterService = require('../services/shelter.service');
const recommendationService = require('../services/recommendation.service');
const ExcelJS = require('exceljs');
const historyService = require('../services/history.service');
const { estimateCapacityFromArea } = require('../services/capacity-estimator');

// ------------------------------------------------------------- overview
exports.stats = asyncHandler(async (req, res) => {
  const [shelterStats, facilityStats, requestStats, userStats, recent] = await Promise.all([
    db.query(`
      SELECT
        COUNT(*)::int                                                  AS total_shelters,
        COUNT(*) FILTER (WHERE status = 'available')::int              AS available_shelters,
        COUNT(*) FILTER (WHERE status = 'limited')::int                AS limited_shelters,
        COUNT(*) FILTER (WHERE status = 'full')::int                   AS full_shelters,
        COUNT(*) FILTER (WHERE status = 'closed')::int                 AS closed_shelters,
        COALESCE(SUM(total_capacity) FILTER (WHERE status IN ('available','limited','full')), 0)::int AS total_capacity,
        COALESCE(SUM(current_occupancy) FILTER (WHERE status IN ('available','limited','full')), 0)::int AS current_occupancy,
        COALESCE(SUM(available_capacity) FILTER (WHERE status IN ('available','limited','full')), 0)::int AS available_capacity
      FROM shelters
      WHERE is_active = TRUE
        AND facility_category = 'registered_shelter'
        AND status NOT IN ('potential','under_verification','registered')`),
    db.query(`
      SELECT
        COUNT(*) FILTER (WHERE facility_category = 'potential_facility')::int AS total_potential,
        COUNT(*) FILTER (WHERE status = 'potential')::int          AS awaiting_review,
        COUNT(*) FILTER (WHERE status = 'under_verification')::int AS under_verification,
        COUNT(*) FILTER (WHERE status = 'registered')::int         AS registered_not_activated
      FROM shelters WHERE is_active = TRUE`),
    db.query(`
      SELECT
        COUNT(*)::int                                            AS total_requests,
        COUNT(*) FILTER (WHERE status IN ('pending','allocated'))::int AS active_requests,
        COUNT(*) FILTER (WHERE status = 'pending')::int          AS pending_requests,
        COUNT(*) FILTER (WHERE priority = 'critical'
                          AND status IN ('pending','allocated'))::int  AS critical_requests,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours')::int AS requests_24h,
        COUNT(*) FILTER (WHERE status = 'allocated' AND allocation_confirmed = FALSE)::int
                                                                 AS awaiting_review,
        COUNT(*) FILTER (WHERE allocation_confirmed = TRUE)::int AS confirmed_allocations,
        COALESCE(SUM(total_people) FILTER (WHERE status IN ('pending','allocated')), 0)::int
                                                                 AS people_awaiting
      FROM emergency_requests`),
    db.query(`
      SELECT COUNT(*)::int AS total_users,
             COUNT(*) FILTER (WHERE role = 'admin')::int AS admin_users,
             COUNT(*) FILTER (WHERE is_active)::int      AS active_users
      FROM users`),
    db.query(`
      SELECT r.id, r.priority, r.status, r.disaster_code, r.total_people, r.created_at,
             u.name AS user_name, s.name AS shelter_name
      FROM emergency_requests r
      JOIN users u ON u.id = r.user_id
      LEFT JOIN shelters s ON s.id = r.recommended_shelter_id
      ORDER BY r.created_at DESC LIMIT 8`)
  ]);

  const s = shelterStats.rows[0];
  const p = facilityStats.rows[0];
  const r = requestStats.rows[0];
  const u = userStats.rows[0];

  res.json({
    success: true,
    data: {
      shelters: {
        total: s.total_shelters,
        available: s.available_shelters,
        limited: s.limited_shelters,
        full: s.full_shelters,
        closed: s.closed_shelters,
        totalCapacity: s.total_capacity,
        currentOccupancy: s.current_occupancy,
        availableCapacity: s.available_capacity,
        occupancyRate:
          s.total_capacity > 0
            ? Math.round((s.current_occupancy / s.total_capacity) * 100)
            : 0
      },
      potentialFacilities: {
        total: p.total_potential,
        awaitingReview: p.awaiting_review,
        underVerification: p.under_verification,
        registeredNotActivated: p.registered_not_activated
      },
      requests: {
        total: r.total_requests,
        active: r.active_requests,
        pending: r.pending_requests,
        critical: r.critical_requests,
        last24h: r.requests_24h,
        awaitingReview: r.awaiting_review,
        confirmedAllocations: r.confirmed_allocations,
        peopleAwaiting: r.people_awaiting
      },
      users: { total: u.total_users, admins: u.admin_users, active: u.active_users },
      recentRequests: recent.rows.map((row) => ({
        id: row.id,
        priority: row.priority,
        status: row.status,
        disasterCode: row.disaster_code,
        totalPeople: row.total_people,
        userName: row.user_name,
        shelterName: row.shelter_name,
        createdAt: row.created_at
      }))
    }
  });
});

// -------------------------------------------------------- shelter CRUD
exports.listShelters = asyncHandler(async (req, res) => {
  const { shelters, total } = await shelterService.listShelters({
    ...req.query,
    includeInactive: true
  });
  res.json({ success: true, data: { shelters, total } });
});

exports.createShelter = asyncHandler(async (req, res) => {
  const shelter = await shelterService.createShelter(req.body);
  res.status(201).json({ success: true, data: { shelter } });
});

exports.updateShelter = asyncHandler(async (req, res) => {
  const shelter = await shelterService.updateShelter(Number(req.params.id), req.body, req.user.id);
  res.json({ success: true, data: { shelter } });
});

exports.updateOccupancy = asyncHandler(async (req, res) => {
  const shelter = await shelterService.updateOccupancy(
    Number(req.params.id),
    req.body.currentOccupancy
  );
  res.json({ success: true, data: { shelter } });
});

exports.deactivateShelter = asyncHandler(async (req, res) => {
  const shelter = await shelterService.deactivateShelter(Number(req.params.id), req.user.id);
  res.json({ success: true, data: { shelter } });
});

exports.deleteShelter = asyncHandler(async (req, res) => {
  const result = await shelterService.deleteShelter(Number(req.params.id));
  res.json({ success: true, data: result });
});

// -------------------------------------- potential-facility lifecycle
exports.markUnderVerification = asyncHandler(async (req, res) => {
  const shelter = await shelterService.markUnderVerification(
    Number(req.params.id),
    req.user.id,
    req.body.note
  );
  res.json({ success: true, data: { shelter } });
});

exports.verifyFacility = asyncHandler(async (req, res) => {
  const shelter = await shelterService.verifyFacility(
    Number(req.params.id),
    req.user.id,
    req.body.note
  );
  res.json({ success: true, data: { shelter } });
});

exports.activateFacility = asyncHandler(async (req, res) => {
  const shelter = await shelterService.activateFacility(Number(req.params.id), req.user.id, req.body);
  res.json({ success: true, data: { shelter } });
});

/**
 * Deterministic AREA_BASED estimate using the Sphere minimum standard.
 * Does not save anything — the admin reviews the number, then it is
 * entered (or adjusted) as the shelter's totalCapacity in the normal
 * create/update/activate calls.
 */
exports.estimateCapacity = asyncHandler(async (req, res) => {
  const result = estimateCapacityFromArea(req.body.floorAreaSqm, req.body.areaPerPerson);
  res.json({ success: true, data: result });
});

// ------------------------------------------------------- request admin
exports.listRequests = asyncHandler(async (req, res) => {
  const { requests, total } = await recommendationService.listRequests(req.query);
  res.json({ success: true, data: { requests, total } });
});

exports.getRequest = asyncHandler(async (req, res) => {
  const request = await recommendationService.getRequestById(
    Number(req.params.id),
    req.user.id,
    'admin'
  );
  res.json({ success: true, data: { request } });
});

exports.updateRequestStatus = asyncHandler(async (req, res) => {
  const request = await recommendationService.updateRequestStatus(
    Number(req.params.id),
    req.body.status,
    req.user.id
  );
  res.json({ success: true, data: { request } });
});

// -------------------------------------------- allocation review (admin)
/** "Keep allocation" — endorses the engine's top pick without changing it. */
exports.confirmAllocation = asyncHandler(async (req, res) => {
  const request = await recommendationService.confirmAllocation(
    Number(req.params.id),
    req.user.id,
    req.body.note
  );
  res.json({ success: true, data: { request } });
});

/** "Change shelter" — overrides the allocation with an admin-chosen shelter. */
exports.reassignAllocation = asyncHandler(async (req, res) => {
  const request = await recommendationService.reassignAllocation(
    Number(req.params.id),
    req.user.id,
    req.body.shelterId,
    req.body.note
  );
  res.json({ success: true, data: { request } });
});

// -------------------------------------------------------------- history
exports.listHistory = asyncHandler(async (req, res) => {
  const { entries, total } = await historyService.listHistory(req.query);
  res.json({ success: true, data: { entries, total } });
});

/** XLSX export of the audit trail — styled, filtered Excel file generated via exceljs. */
exports.exportHistory = asyncHandler(async (req, res) => {
  const entries = await historyService.listHistoryForExport(req.query);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'ESAP Platform';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('Allocation History', {
    views: [{ state: 'frozen', ySplit: 1 }]
  });

  worksheet.columns = [
    { header: 'ID', key: 'id', width: 10 },
    { header: 'Date & Time', key: 'createdAt', width: 22 },
    { header: 'Action', key: 'action', width: 20 },
    { header: 'Request ID', key: 'requestId', width: 14 },
    { header: 'Shelter Name', key: 'shelterName', width: 32 },
    { header: 'Performed By', key: 'performedByName', width: 24 },
    { header: 'User Email', key: 'performedByEmail', width: 28 },
    { header: 'Notes', key: 'notes', width: 45 }
  ];

  // Header styling
  worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1F2937' } // Dark gray / slate
  };
  worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
  worksheet.getRow(1).height = 24;

  entries.forEach((e) => {
    const row = worksheet.addRow({
      id: e.id,
      createdAt: e.createdAt instanceof Date ? e.createdAt.toISOString().replace('T', ' ').substring(0, 19) : String(e.createdAt || ''),
      action: e.action,
      requestId: e.requestId ?? 'N/A',
      shelterName: e.shelterName ?? 'N/A',
      performedByName: e.performedByName ?? 'System',
      performedByEmail: e.performedByEmail ?? 'system',
      notes: e.notes ?? ''
    });

    // Formatting
    row.alignment = { vertical: 'middle' };
    row.getCell('id').alignment = { horizontal: 'center' };
    row.getCell('requestId').alignment = { horizontal: 'center' };
    row.getCell('action').alignment = { horizontal: 'center' };
  });

  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader(
    'Content-Disposition',
    'attachment; filename="esap-allocation-history.xlsx"'
  );

  await workbook.xlsx.write(res);
  res.end();
});

// ---------------------------------------------------------- user admin
/**
 * Deliberately limited: name, email, role, activity and request count only.
 * Password hashes, phone numbers and request contents are not exposed here.
 */
exports.listUsers = asyncHandler(async (req, res) => {
  const limit = req.query.limit ?? 50;
  const offset = req.query.offset ?? 0;
  const [{ rows }, count] = await Promise.all([
    db.query(
      `SELECT u.id, u.name, u.email, u.role, u.is_active, u.created_at,
              COUNT(r.id)::int AS request_count
       FROM users u
       LEFT JOIN emergency_requests r ON r.user_id = u.id
       GROUP BY u.id
       ORDER BY u.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    ),
    db.query('SELECT COUNT(*)::int AS total FROM users')
  ]);

  res.json({
    success: true,
    data: {
      users: rows.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        isActive: u.is_active,
        requestCount: u.request_count,
        createdAt: u.created_at
      })),
      total: count.rows[0].total
    }
  });
});

exports.updateUser = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user.id) {
    throw ApiError.badRequest('You cannot change your own role or status');
  }

  const sets = [];
  const params = [];
  if (req.body.role !== undefined) {
    params.push(req.body.role);
    sets.push(`role = $${params.length}`);
  }
  if (req.body.isActive !== undefined) {
    params.push(req.body.isActive);
    sets.push(`is_active = $${params.length}`);
  }
  if (!sets.length) throw ApiError.badRequest('Nothing to update');

  params.push(id);
  const { rows } = await db.query(
    `UPDATE users SET ${sets.join(', ')} WHERE id = $${params.length}
     RETURNING id, name, email, role, is_active, created_at`,
    params
  );
  if (!rows[0]) throw ApiError.notFound('User not found');

  res.json({
    success: true,
    data: {
      user: {
        id: rows[0].id,
        name: rows[0].name,
        email: rows[0].email,
        role: rows[0].role,
        isActive: rows[0].is_active,
        createdAt: rows[0].created_at
      }
    }
  });
});
