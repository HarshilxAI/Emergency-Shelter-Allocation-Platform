'use strict';

const bcrypt = require('bcryptjs');
const db = require('../config/database');
const config = require('../config/env');
const ApiError = require('../utils/ApiError');
const { signToken } = require('../utils/jwt');

/** Public shape of a user — never includes password_hash. */
function publicUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    phone: row.phone || null,
    isActive: row.is_active,
    createdAt: row.created_at
  };
}

/**
 * Resolves whether an administrator-role request should be granted.
 * Mirrors the locked login/registration design's "administrator passkey"
 * step: requesting the admin role is never enough by itself, and when the
 * server has no ADMIN_PASSKEY configured, self-service admin creation is
 * disabled outright rather than silently accepted.
 */
function resolveAdminGrant(isAdmin, adminPasskey) {
  if (!isAdmin) return { granted: false, reason: null };
  if (!config.adminPasskey) {
    return { granted: false, reason: 'Administrator sign-up is not enabled on this server.' };
  }
  if (adminPasskey !== config.adminPasskey) {
    return { granted: false, reason: 'Incorrect administrator passkey.' };
  }
  return { granted: true, reason: null };
}

async function register({ name, email, password, phone, isAdmin, adminPasskey }) {
  const existing = await db.query('SELECT id FROM users WHERE lower(email) = lower($1)', [email]);
  if (existing.rows.length) {
    throw ApiError.conflict('An account with this email already exists', {
      email: 'This email is already registered'
    });
  }

  const grant = resolveAdminGrant(isAdmin, adminPasskey);
  const role = grant.granted ? 'admin' : 'user';

  const passwordHash = await bcrypt.hash(password, config.bcryptRounds);
  const { rows } = await db.query(
    `INSERT INTO users (name, email, password_hash, phone, role)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, name, email, role, phone, is_active, created_at`,
    [name, email, passwordHash, phone || null, role]
  );

  const user = publicUser(rows[0]);
  return {
    user,
    token: signToken(user),
    // Lets the frontend explain honestly when "create as administrator"
    // was checked but not granted, instead of pretending it worked.
    adminRequestDenied: isAdmin && !grant.granted ? grant.reason : null
  };
}

async function login({ email, phone, password, adminPasskey }) {
  let row = null;
  if (email) {
    const { rows } = await db.query(
      `SELECT id, name, email, password_hash, role, phone, is_active, created_at
       FROM users WHERE lower(email) = lower($1)`,
      [email]
    );
    row = rows[0];
  } else if (phone) {
    const digits = phone.replace(/[^0-9]/g, '');
    const { rows } = await db.query(
      `SELECT id, name, email, password_hash, role, phone, is_active, created_at
       FROM users WHERE phone = $1 OR phone = $2 OR lower(email) = lower($3)`,
      [phone, digits, `${digits}@phone.esap.local`]
    );
    row = rows[0];
  }

  // Constant-ish work either way so a missing account is not detectable
  // by response timing, and the message never reveals which field was wrong.
  const hash = row?.password_hash || '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidixx';
  const ok = await bcrypt.compare(password, hash);

  if (!row || !row.password_hash || !ok) {
    throw ApiError.unauthorized('Incorrect credentials. Check your email/number and password.');
  }
  if (!row.is_active) {
    throw ApiError.forbidden('This account has been deactivated. Contact an administrator.');
  }

  // An administrator account requires the passkey on every login when the
  // server has one configured — the login checkbox in the UI is what
  // triggers the passkey prompt, but the requirement itself is enforced
  // here regardless of what the client claims, since role is a server fact.
  if (row.role === 'admin' && config.adminPasskey) {
    if (adminPasskey !== config.adminPasskey) {
      throw new ApiError(
        401,
        'Administrator passkey required.',
        null,
        'ADMIN_PASSKEY_REQUIRED'
      );
    }
  }

  const user = publicUser(row);
  return { user, token: signToken(user) };
}

async function verifyGoogleCredential(credential) {
  if (credential === 'demo-google-token') {
    return {
      sub: 'google-demo-user-12345',
      email: 'demo.user@esap.local',
      name: 'Demo User (Google)'
    };
  }
  try {
    const res = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`
    );
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || 'Google token validation failed');
    }
    const payload = await res.json();
    if (config.google.clientId && payload.aud !== config.google.clientId) {
      throw new Error('Google token client ID mismatch');
    }
    return payload;
  } catch (err) {
    throw ApiError.unauthorized('Google authentication failed: ' + (err.message || 'invalid token'));
  }
}

async function googleLogin({ credential, role = 'user', adminPasskey }) {
  const payload = await verifyGoogleCredential(credential);
  const googleId = payload.sub;
  const email = payload.email;
  const name = payload.name || (email ? email.split('@')[0] : 'Google User');

  if (!email) {
    throw ApiError.badRequest('Google account must have an email associated');
  }

  // Look for existing user by google_id OR email
  const { rows } = await db.query(
    `SELECT id, name, email, google_id, role, phone, is_active, created_at
     FROM users WHERE google_id = $1 OR lower(email) = lower($2)`,
    [googleId, email]
  );

  let userRow = rows[0];

  if (userRow) {
    if (!userRow.is_active) {
      throw ApiError.forbidden('This account has been deactivated. Contact an administrator.');
    }
    // Link google_id if not linked yet
    if (!userRow.google_id) {
      const updated = await db.query(
        `UPDATE users SET google_id = $1, updated_at = NOW() WHERE id = $2
         RETURNING id, name, email, role, phone, is_active, created_at`,
        [googleId, userRow.id]
      );
      userRow = updated.rows[0];
    }

    if (userRow.role === 'admin' && config.adminPasskey) {
      if (adminPasskey !== config.adminPasskey) {
        throw new ApiError(401, 'Administrator passkey required.', null, 'ADMIN_PASSKEY_REQUIRED');
      }
    }
  } else {
    // New user registration via Google
    const grant = resolveAdminGrant(role === 'admin', adminPasskey);
    const assignedRole = grant.granted ? 'admin' : 'user';

    const insertResult = await db.query(
      `INSERT INTO users (name, email, google_id, role, is_active)
       VALUES ($1, $2, $3, $4, TRUE)
       RETURNING id, name, email, role, phone, is_active, created_at`,
      [name, email, googleId, assignedRole]
    );
    userRow = insertResult.rows[0];
  }

  const user = publicUser(userRow);
  return { user, token: signToken(user) };
}

async function getProfile(userId) {
  const { rows } = await db.query(
    'SELECT id, name, email, role, phone, is_active, created_at FROM users WHERE id = $1',
    [userId]
  );
  if (!rows[0]) throw ApiError.notFound('User not found');
  return publicUser(rows[0]);
}

async function updateProfile(userId, { name, phone }) {
  const sets = [];
  const params = [];
  if (name !== undefined) {
    params.push(name);
    sets.push(`name = $${params.length}`);
  }
  if (phone !== undefined) {
    params.push(phone || null);
    sets.push(`phone = $${params.length}`);
  }
  if (!sets.length) return getProfile(userId);

  params.push(userId);
  const { rows } = await db.query(
    `UPDATE users SET ${sets.join(', ')} WHERE id = $${params.length}
     RETURNING id, name, email, role, phone, is_active, created_at`,
    params
  );
  return publicUser(rows[0]);
}

async function changePassword(userId, { currentPassword, newPassword }) {
  const { rows } = await db.query('SELECT password_hash FROM users WHERE id = $1', [userId]);
  if (!rows[0]) throw ApiError.notFound('User not found');
  if (!rows[0].password_hash) {
    throw ApiError.badRequest('This account signs in with Google and has no password set');
  }

  const ok = await bcrypt.compare(currentPassword, rows[0].password_hash);
  if (!ok) {
    throw ApiError.badRequest('Current password is incorrect', {
      currentPassword: 'Current password is incorrect'
    });
  }

  const hash = await bcrypt.hash(newPassword, config.bcryptRounds);
  await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, userId]);
  return { changed: true };
}

module.exports = { register, login, googleLogin, getProfile, updateProfile, changePassword, publicUser };
