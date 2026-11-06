const db = require('../config/db');

// Operational policies. Defaults apply when a key is missing from system_settings.
const DEFAULTS = {
  sla_hours_critical: { value: '4', description: 'Complaint SLA (hours) for critical priority' },
  sla_hours_high: { value: '12', description: 'Complaint SLA (hours) for high priority' },
  sla_hours_medium: { value: '24', description: 'Complaint SLA (hours) for medium priority' },
  sla_hours_low: { value: '72', description: 'Complaint SLA (hours) for low priority' },
  attendance_low_threshold: { value: '75', description: 'Monthly attendance % below which a student is flagged' },
  repeated_absence_count: { value: '3', description: 'Absences within 7 days that count as repeated absence' },
  attendance_late_after: { value: '21:30', description: 'Check-in time after which a student is marked late' },
  leave_return_grace_hours: { value: '2', description: 'Hours after expected return before a leave is flagged overdue' },
  fee_due_soon_days: { value: '7', description: 'Days before due date to send fee reminders' },
  fee_overdue_blocks_leave: { value: 'false', description: 'If true, students with overdue fees cannot apply for leave' },
  visitor_hours_start: { value: '08:00', description: 'Visitor check-in allowed from' },
  visitor_hours_end: { value: '19:00', description: 'Visitor check-in allowed until' },
  feature_new_admission_flow: { value: 'false', description: 'Enable layered flow: Application -> Room Category -> Auto Fee Allocation -> Room Allotment' },
};

let cache = null;
let cacheAt = 0;

async function getSettings(force = false) {
  if (!force && cache && Date.now() - cacheAt < 60_000) return cache;
  const rows = await db.query('SELECT setting_key, setting_value FROM system_settings');
  const map = Object.fromEntries(Object.entries(DEFAULTS).map(([k, v]) => [k, v.value]));
  rows.forEach((r) => { map[r.setting_key] = r.setting_value; });
  cache = map;
  cacheAt = Date.now();
  return map;
}

const invalidate = () => { cache = null; };

async function getNumber(key) {
  return Number((await getSettings())[key]);
}

async function getBool(key) {
  return (await getSettings())[key] === 'true';
}

async function slaHours(priority) {
  return getNumber(`sla_hours_${priority}`);
}

module.exports = { DEFAULTS, getSettings, getNumber, getBool, slaHours, invalidate };
