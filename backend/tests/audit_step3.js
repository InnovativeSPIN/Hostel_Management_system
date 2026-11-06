require('dotenv').config();
const { pool } = require('../src/config/db');

async function audit() {
  const [hostelsCols] = await pool.query('DESCRIBE hostels');
  console.log('Hostels columns:', hostelsCols.map(c => `${c.Field} (${c.Type})`).join(', '));
  const [hostels] = await pool.query('SELECT * FROM hostels');
  console.log('Hostels rows:', JSON.stringify(hostels, null, 2));

  const [floorsCols] = await pool.query('DESCRIBE floors');
  console.log('Floors columns:', floorsCols.map(c => `${c.Field} (${c.Type})`).join(', '));
  const [floors] = await pool.query('SELECT * FROM floors');
  console.log('Floors count:', floors.length);

  const [roomsCols] = await pool.query('DESCRIBE rooms');
  console.log('Rooms columns:', roomsCols.map(c => `${c.Field} (${c.Type})`).join(', '));
  const [roomsSample] = await pool.query('SELECT * FROM rooms LIMIT 5');
  console.log('Rooms sample:', JSON.stringify(roomsSample, null, 2));

  const [bedsCols] = await pool.query('DESCRIBE beds');
  console.log('Beds columns:', bedsCols.map(c => `${c.Field} (${c.Type})`).join(', '));

  const [feeStructuresCols] = await pool.query('DESCRIBE fee_structures');
  console.log('FeeStructures columns:', feeStructuresCols.map(c => `${c.Field} (${c.Type})`).join(', '));
  const [feeStructures] = await pool.query('SELECT * FROM fee_structures');
  console.log('FeeStructures rows:', JSON.stringify(feeStructures, null, 2));

  process.exit(0);
}

audit().catch(err => {
  console.error(err);
  process.exit(1);
});
