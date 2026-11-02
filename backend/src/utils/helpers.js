const crypto = require('crypto');

const pad = (n) => String(n).padStart(2, '0');

function toDateStr(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toDateTimeStr(d = new Date()) {
  return `${toDateStr(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return toDateStr(new Date(y, m - 1, d + days));
}

// Academic year runs June -> May, e.g. "2026-27".
function currentAcademicYear(d = new Date()) {
  const start = d.getMonth() >= 5 ? d.getFullYear() : d.getFullYear() - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function round(n, digits = 1) {
  const f = 10 ** digits;
  return Math.round((Number(n) || 0) * f) / f;
}

function pct(part, whole, digits = 1) {
  return whole > 0 ? round((part / whole) * 100, digits) : 0;
}

// Replace a temporary code with a readable sequential one derived from the row id.
async function assignCode(conn, table, column, prefix, id, base = 1000) {
  const code = `${prefix}${base + Number(id)}`;
  await conn.query(`UPDATE ${table} SET ${column} = ? WHERE id = ?`, [code, id]);
  return code;
}

const tempCode = () => `TMP${crypto.randomBytes(6).toString('hex')}`;

module.exports = { toDateStr, toDateTimeStr, addDays, currentAcademicYear, randomToken, sha256, round, pct, assignCode, tempCode };
