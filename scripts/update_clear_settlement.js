const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../backend/src/modules/exits/exits.routes.js');
let code = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');

const oldClearUpdate = `      await conn.query(
        \`UPDATE hostel_exit_records SET clearance_status = 'cleared', exit_date = ?, pending_fees = ?, approved_by = ?, approved_at = NOW() WHERE id = ?\`,
        [req.body.exitDate, due, req.user.id, e.id]);`;

const newClearUpdate = `      await conn.query(
        \`UPDATE hostel_exit_records SET clearance_status = 'cleared', exit_date = ?, pending_fees = ?, approved_by = ?, approved_at = NOW() WHERE id = ?\`,
        [req.body.exitDate, due, req.user.id, e.id]);
      await conn.query(
        \`UPDATE exit_settlements SET status = 'settled', settled_by = ?, settled_at = NOW() WHERE exit_record_id = ?\`,
        [req.user.id, e.id]);`;

if (code.includes(oldClearUpdate)) {
  code = code.replace(oldClearUpdate, newClearUpdate);
  fs.writeFileSync(filePath, code.replace(/\n/g, '\r\n'), 'utf8');
  console.log('Added exit_settlements update to clear endpoint');
} else {
  console.log('Could not find oldClearUpdate');
}
