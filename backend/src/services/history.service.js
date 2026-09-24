'use strict';

const db = require('../config/database');

/**
 * Records one audit-trail entry. Used for both request-allocation events
 * (allocated, confirmed, reassigned, closed) and shelter lifecycle events
 * (shelter_verified, shelter_activated, shelter_updated, shelter_deactivated),
 * so the admin History screen shows a single unified timeline rather than
 * two disconnected logs.
 *
 * Never throws into the caller's main flow — history is an audit aid, not
 * a correctness dependency, so a logging failure is swallowed after being
 * reported to the console rather than failing the request it describes.
 */
async function logHistory({ requestId = null, shelterId = null, action, performedBy = null, notes = null }) {
  try {
    await db.query(
      `INSERT INTO allocation_history (request_id, shelter_id, action, performed_by, notes)
       VALUES ($1, $2, $3, $4, $5)`,
      [requestId, shelterId, action, performedBy, notes || null]
    );
  } catch (err) {
    console.error('[history] failed to record entry:', err.message);
  }
}

const HISTORY_SELECT = `
  SELECT h.id, h.request_id, h.shelter_id, h.action, h.notes, h.created_at,
         u.name AS performed_by_name, u.email AS performed_by_email,
         s.name AS shelter_name,
         r.total_people, r.priority, r.disaster_code
  FROM allocation_history h
  LEFT JOIN users u ON u.id = h.performed_by
  LEFT JOIN shelters s ON s.id = h.shelter_id
  LEFT JOIN emergency_requests r ON r.id = h.request_id
`;

function mapEntry(row) {
  return {
    id: row.id,
    requestId: row.request_id,
    shelterId: row.shelter_id,
    shelterName: row.shelter_name,
    action: row.action,
    notes: row.notes,
    performedByName: row.performed_by_name,
    performedByEmail: row.performed_by_email,
    requestSummary: row.request_id
      ? { totalPeople: row.total_people, priority: row.priority, disasterCode: row.disaster_code }
      : null,
    createdAt: row.created_at
  };
}

function buildHistoryFilter({ requestId, action, search, fromDate, toDate } = {}) {
  const where = [];
  const params = [];

  if (requestId) {
    params.push(requestId);
    where.push(`h.request_id = $${params.length}`);
  }

  if (action) {
    params.push(action);
    where.push(`h.action = $${params.length}`);
  }

  if (fromDate) {
    params.push(fromDate);
    where.push(`h.created_at >= $${params.length}`);
  }

  if (toDate) {
    params.push(toDate);
    where.push(`h.created_at <= $${params.length}`);
  }

  if (search) {
    params.push(`%${search}%`);
    const idx = params.length;
    where.push(`(
      s.name ILIKE $${idx} OR
      u.name ILIKE $${idx} OR
      u.email ILIKE $${idx} OR
      h.notes ILIKE $${idx} OR
      h.action ILIKE $${idx}
    )`);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return { whereSql, params };
}

async function listHistory({ limit = 100, offset = 0, requestId, action, search, fromDate, toDate } = {}) {
  const { whereSql, params } = buildHistoryFilter({ requestId, action, search, fromDate, toDate });
  const countParams = [...params];

  params.push(limit, offset);
  const limitIdx = params.length - 1;
  const offsetIdx = params.length;

  const [{ rows }, count] = await Promise.all([
    db.query(
      `${HISTORY_SELECT} ${whereSql} ORDER BY h.created_at DESC LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      params
    ),
    db.query(`SELECT COUNT(*)::int AS total FROM allocation_history h LEFT JOIN users u ON u.id = h.performed_by LEFT JOIN shelters s ON s.id = h.shelter_id ${whereSql}`, countParams)
  ]);

  return { entries: rows.map(mapEntry), total: count.rows[0].total };
}

/** Filtered entries for XLSX export — capped generously rather than unbounded. */
async function listHistoryForExport({ limit = 5000, requestId, action, search, fromDate, toDate } = {}) {
  const { whereSql, params } = buildHistoryFilter({ requestId, action, search, fromDate, toDate });
  params.push(limit);
  const limitIdx = params.length;

  const { rows } = await db.query(
    `${HISTORY_SELECT} ${whereSql} ORDER BY h.created_at DESC LIMIT $${limitIdx}`,
    params
  );
  return rows.map(mapEntry);
}

module.exports = { logHistory, listHistory, listHistoryForExport };
