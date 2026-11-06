const db = require('../backend/src/config/db');

async function clean() {
  await db.query('DROP TABLE IF EXISTS exit_settlements');
  try { await db.query('ALTER TABLE hostel_exit_records DROP FOREIGN KEY fk_exit_warden_appr'); } catch (_) {}
  const cols = ['warden_approved_by', 'warden_approved_at', 'warden_remarks', 'damage_photo_url', 'inspection_checklist', 'settlement_id'];
  for (const c of cols) {
    try { await db.query(`ALTER TABLE hostel_exit_records DROP COLUMN ${c}`); } catch (_) {}
  }
  console.log('Cleaned up partial migration 009');
  process.exit(0);
}

clean().catch(console.error);
