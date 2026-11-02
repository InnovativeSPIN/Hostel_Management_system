const db = require('../../config/db');

const OPEN_STATES = ['pending', 'assigned', 'in_progress'];

// Status transitions and who may perform them ("staff" = assignee, "manager" = warden/admin).
const TRANSITIONS = {
  pending: { assigned: ['manager'], rejected: ['manager'] },
  assigned: { in_progress: ['staff', 'manager'], rejected: ['manager'] },
  in_progress: { resolved: ['staff', 'manager'] },
  resolved: { closed: ['student', 'manager'], in_progress: ['student', 'manager'] },
  closed: {},
  rejected: {},
};

// Picks the least-loaded active staff member in the hostel whose skill matches the category.
async function pickAssignee(conn, hostelId, category) {
  const row = await db.one(
    `SELECT u.id, u.name FROM users u JOIN roles r ON r.id = u.role_id AND r.name = 'staff'
       JOIN user_hostels uh ON uh.user_id = u.id AND uh.hostel_id = ?
      WHERE u.status = 'active' AND u.deleted_at IS NULL AND u.staff_skill IN (?, 'general')
      ORDER BY (u.staff_skill = ?) DESC,
               (SELECT COUNT(*) FROM complaints c WHERE c.assigned_to = u.id AND c.status IN ('assigned','in_progress')) ASC, u.id
      LIMIT 1`, [hostelId, category, category], conn);
  return row;
}

/**
 * Transparent keyword rules that suggest a category and priority while the student types.
 * This is deliberately rule-based (not ML); the student always makes the final choice.
 */
const CATEGORY_RULES = [
  ['electrical', /\b(fan|light|bulb|tube ?light|switch|socket|plug|power|current|wiring|spark|shock|mcb|fuse|electric)/i],
  ['plumbing', /\b(tap|water|leak|pipe|flush|toilet|drain|geyser|heater|shower|bathroom|block(ed)?|overflow)/i],
  ['internet', /\b(wifi|wi-fi|internet|network|lan|router|connection|bandwidth|signal)/i],
  ['furniture', /\b(bed|cot|chair|table|cupboard|almirah|door|window|lock|mattress|shelf|drawer|hinge)/i],
  ['cleaning', /\b(clean|dust|garbage|trash|smell|dirty|sweep|mop|cockroach|pest|rat|mosquito|insect)/i],
  ['food', /\b(food|mess|meal|breakfast|lunch|dinner|rice|canteen|hygiene|stale)/i],
  ['security', /\b(theft|stolen|missing|stranger|intruder|harass|unsafe|cctv|guard|fight)/i],
];
const CRITICAL = /\b(shock|spark|fire|smoke|short circuit|gas|flood|injur|bleed|unsafe|harass|intruder|collapse)/i;
const HIGH = /\b(no water|no power|power cut|not working|broken lock|leak|overflow|theft|stolen|blocked toilet|whole floor|entire)/i;

function suggest(text) {
  const category = CATEGORY_RULES.find(([, re]) => re.test(text))?.[0] || 'other';
  const priority = CRITICAL.test(text) ? 'critical' : HIGH.test(text) ? 'high' : text.length > 0 ? 'medium' : 'low';
  return { category, priority, method: 'keyword-rules' };
}

module.exports = { OPEN_STATES, TRANSITIONS, pickAssignee, suggest };
