// Hostel-level data scoping. Super admins see everything; wardens/staff/security only
// their assigned hostels; students only their own records (handled per module).
const { forbidden } = require('./AppError');

const isAdmin = (user) => user.role === 'super_admin';
const isStudent = (user) => user.role === 'student';

// Adds "<column> IN (...)" to a Where builder for non-admin staff.
function scopeHostel(where, user, column) {
  if (isAdmin(user) || isStudent(user)) return where;
  if (!user.hostelIds.length) return where.add('1 = 0');
  return where.add(`${column} IN (?)`, user.hostelIds);
}

// Same as scopeHostel but returns an SQL fragment + params for hand-written queries.
function hostelFilter(user, column) {
  if (isAdmin(user)) return { sql: '1 = 1', params: [] };
  if (!user.hostelIds.length) return { sql: '1 = 0', params: [] };
  return { sql: `${column} IN (?)`, params: [user.hostelIds] };
}

function assertHostelAccess(user, hostelId) {
  if (isAdmin(user)) return;
  if (!user.hostelIds.includes(Number(hostelId))) throw forbidden('This record belongs to a hostel outside your scope');
}

module.exports = { isAdmin, isStudent, scopeHostel, hostelFilter, assertHostelAccess };
