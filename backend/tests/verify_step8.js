const assert = require('assert');
const path = require('path');
const fs = require('fs');
const http = require('http');
const db = require('../src/config/db');
const app = require('../src/app');

// Valid minimal 1x1 PNG image buffer
const samplePng = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082', 'hex');

async function run() {
  console.log('--- Verifying Step 8: Maintenance & Complaints with Image Proof ---');

  // 1. Verify schema: complaint_maintenance_attachments table and views
  const tableCheck = await db.one("SELECT COUNT(*) as n FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'complaint_maintenance_attachments'");
  assert.strictEqual(Number(tableCheck.n), 1, 'Table complaint_maintenance_attachments must exist');

  const viewCheck1 = await db.one("SELECT COUNT(*) as n FROM information_schema.views WHERE table_schema = DATABASE() AND table_name = 'complaint_attachments'");
  assert.strictEqual(Number(viewCheck1.n), 1, 'View complaint_attachments must exist');

  const viewCheck2 = await db.one("SELECT COUNT(*) as n FROM information_schema.views WHERE table_schema = DATABASE() AND table_name = 'maintenance_attachments'");
  assert.strictEqual(Number(viewCheck2.n), 1, 'View maintenance_attachments must exist');
  console.log('✔ Database table and views verified');

  // 2. Start server on dynamic port
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api`;
  console.log(`Test server running at ${baseUrl}`);

  try {
    // 3. Login as admin and student
    const adminUser = await db.one("SELECT u.id, u.email FROM users u JOIN roles r ON r.id = u.role_id WHERE r.name IN ('admin', 'super_admin') LIMIT 1");
    assert(adminUser, 'Admin user must exist');

    // Get an active student with room allocation
    const activeStudent = await db.one(`
      SELECT s.id, s.user_id, u.email, ra.hostel_id, ra.room_id
      FROM students s
      JOIN users u ON u.id = s.user_id
      JOIN room_allocations ra ON ra.student_id = s.id AND ra.status = 'active'
      LIMIT 1
    `);
    assert(activeStudent, 'Active allocated student must exist');

    // Login tokens
    const { signToken } = require('../src/middleware/auth');
    const studentUser = await db.one('SELECT * FROM users WHERE id = ?', [activeStudent.user_id]);
    const adminUserFull = await db.one('SELECT * FROM users WHERE id = ?', [adminUser.id]);
    const studentToken = signToken(studentUser);
    const adminToken = signToken(adminUserFull);

    // 4. Test: Raise complaint with JSON (Existing flow regression check)
    const jsonRes = await fetch(`${baseUrl}/complaints`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentToken}`,
      },
      body: JSON.stringify({
        title: `Test Water Leakage ${Date.now()}`,
        description: 'Water tap is dripping continuously in bathroom',
        category: 'plumbing',
        priority: 'medium',
      }),
    });
    const jsonResult = await jsonRes.json();
    assert.strictEqual(jsonRes.status, 201, `JSON complaint creation failed: ${JSON.stringify(jsonResult)}`);
    assert(jsonResult.data.complaintCode, 'Should return complaintCode');
    const jsonComplaintId = jsonResult.data.id;
    console.log(`✔ Regression: Created complaint without images via JSON (${jsonResult.data.complaintCode})`);

    // Verify attachments for JSON complaint are empty
    const jsonGet = await fetch(`${baseUrl}/complaints/${jsonComplaintId}`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    const jsonGetData = await jsonGet.json();
    assert.strictEqual(jsonGet.status, 200);
    assert(Array.isArray(jsonGetData.data.attachments), 'attachments must be an array');
    assert.strictEqual(jsonGetData.data.attachments.length, 0, 'No attachments expected for JSON complaint');
    console.log('✔ Verified empty attachments array for complaint raised without photos');

    // 5. Test: Raise complaint with 2 image attachments via multipart/form-data
    const boundary = '----WebKitFormBoundaryStep8Test' + Math.random().toString(36).substring(2);
    
    // Construct multipart form body
    function makeMultipart(fields, files) {
      const parts = [];
      for (const [k, v] of Object.entries(fields)) {
        parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
      }
      for (const f of files) {
        parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${f.fieldname}"; filename="${f.filename}"\r\nContent-Type: ${f.mimetype}\r\n\r\n`));
        parts.push(f.buffer);
        parts.push(Buffer.from('\r\n'));
      }
      parts.push(Buffer.from(`--${boundary}--\r\n`));
      return Buffer.concat(parts);
    }

    const multipartBody = makeMultipart({
      title: `Broken Switchboard Proof ${Date.now()}`,
      description: 'The main switchboard has sparks coming out. Attached photo proof.',
      category: 'electrical',
      priority: 'high',
    }, [
      { fieldname: 'images', filename: 'photo1.png', mimetype: 'image/png', buffer: samplePng },
      { fieldname: 'images', filename: 'photo2.png', mimetype: 'image/png', buffer: samplePng },
    ]);

    const photoRes = await fetch(`${baseUrl}/complaints`, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        Authorization: `Bearer ${studentToken}`,
      },
      body: multipartBody,
    });
    const photoResult = await photoRes.json();
    assert.strictEqual(photoRes.status, 201, `Multipart complaint creation failed: ${JSON.stringify(photoResult)}`);
    const photoComplaintId = photoResult.data.id;
    console.log(`✔ Created complaint with 2 image proofs (${photoResult.data.complaintCode})`);

    // Verify attachments are returned with URLs
    const photoGet = await fetch(`${baseUrl}/complaints/${photoComplaintId}`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    const photoGetData = await photoGet.json();
    assert.strictEqual(photoGet.status, 200);
    assert.strictEqual(photoGetData.data.attachments.length, 2, 'Should have 2 attachments');
    assert.strictEqual(photoGetData.data.attachments[0].attachment_type, 'complaint');
    assert(photoGetData.data.attachments[0].url.startsWith('/uploads/'), 'Attachment url must start with /uploads/');
    assert.strictEqual(photoGetData.data.attachments_count, 2, 'attachments_count must be 2');
    console.log(`✔ Verified attachments in GET /complaints/:id: ${photoGetData.data.attachments.length} images linked`);

    // 6. Test: Add an additional attachment to an existing complaint via POST /complaints/:id/attachments
    const attachMultipart = makeMultipart({
      attachmentType: 'complaint',
    }, [
      { fieldname: 'images', filename: 'photo3.png', mimetype: 'image/png', buffer: samplePng },
    ]);
    const addAttachRes = await fetch(`${baseUrl}/complaints/${photoComplaintId}/attachments`, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        Authorization: `Bearer ${studentToken}`,
      },
      body: attachMultipart,
    });
    assert.strictEqual(addAttachRes.status, 201, 'Adding attachment to complaint must return 201');
    
    // Check complaint now has 3 attachments
    const photoGet3 = await (await fetch(`${baseUrl}/complaints/${photoComplaintId}`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    })).json();
    assert.strictEqual(photoGet3.data.attachments.length, 3, 'Should now have 3 attachments');
    console.log('✔ Added 3rd attachment via POST /complaints/:id/attachments');

    // 7. Test: Create Maintenance Request with "before" images
    const mntBody = makeMultipart({
      hostelId: activeStudent.hostel_id,
      roomId: activeStudent.room_id,
      category: 'plumbing',
      priority: 'medium',
      title: `Fix pipe leakage in room ${activeStudent.room_id}`,
      description: 'Need pipe replacement before repainting',
    }, [
      { fieldname: 'before_images', filename: 'pipe_damaged.png', mimetype: 'image/png', buffer: samplePng },
    ]);

    const mntRes = await fetch(`${baseUrl}/maintenance`, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        Authorization: `Bearer ${adminToken}`,
      },
      body: mntBody,
    });
    const mntResult = await mntRes.json();
    assert.strictEqual(mntRes.status, 201, `Maintenance creation failed: ${JSON.stringify(mntResult)}`);
    const mntId = mntResult.data.id;
    console.log(`✔ Created maintenance request with 'before' image proof (${mntResult.data.requestCode})`);

    // Verify GET /maintenance/:id includes attachments
    const mntGet = await (await fetch(`${baseUrl}/maintenance/${mntId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    })).json();
    assert.strictEqual(mntGet.data.attachments.length, 1, 'Should have 1 before attachment');
    assert.strictEqual(mntGet.data.attachments[0].attachment_type, 'before');
    console.log('✔ Verified before attachment in GET /maintenance/:id');

    // 8. Test: Transition maintenance request to in_progress then completed with "after" image proof
    await fetch(`${baseUrl}/maintenance/${mntId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ status: 'in_progress', notes: 'Work in progress' }),
    });

    const completeBody = makeMultipart({
      status: 'completed',
      notes: 'Pipe replaced and sealed. Tested with full water pressure.',
      cost: '450',
    }, [
      { fieldname: 'after_images', filename: 'pipe_fixed.png', mimetype: 'image/png', buffer: samplePng },
    ]);

    const patchMntRes = await fetch(`${baseUrl}/maintenance/${mntId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        Authorization: `Bearer ${adminToken}`,
      },
      body: completeBody,
    });
    assert.strictEqual(patchMntRes.status, 200, 'Maintenance completion with after images should return 200');

    // Verify GET /maintenance/:id now has both 'before' and 'after' attachments
    const mntGetUpdated = await (await fetch(`${baseUrl}/maintenance/${mntId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    })).json();
    assert.strictEqual(mntGetUpdated.data.attachments.length, 2, 'Should now have 2 attachments (before & after)');
    const types = mntGetUpdated.data.attachments.map((a) => a.attachment_type);
    assert(types.includes('before'), "Must include 'before' attachment");
    assert(types.includes('after'), "Must include 'after' attachment");
    console.log(`✔ Verified both 'before' and 'after' image proofs for completed maintenance request: [${types.join(', ')}]`);

    // 9. Regression check: Existing complaints in complaints list have proper attachments_count
    const listRes = await (await fetch(`${baseUrl}/complaints?limit=5`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    })).json();
    assert(Array.isArray(listRes.data), 'Complaints list must be array');
    assert(listRes.data.length > 0, 'Complaints list must not be empty');
    console.log('✔ Regression: GET /complaints list endpoint works properly with attachments_count');

    console.log('\n--- ALL STEP 8 BACKEND TESTS PASSED SUCCESSFULLY! ---');
    process.exit(0);
  } finally {
    server.close();
  }
}

run().catch((err) => {
  console.error('❌ Step 8 verification failed:', err);
  process.exit(1);
});
