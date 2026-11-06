const fs = require('fs');
let content = fs.readFileSync('backend/src/modules/visitors/visitors.routes.js', 'utf8');

// 1. Update SELECT to include is_overstay calculation
if (!content.includes('is_overstay')) {
  content = content.replace(
    "TIMESTAMPDIFF(MINUTE, ve.entry_time, COALESCE(ve.exit_time, NOW())) AS minutes_inside`;",
    "TIMESTAMPDIFF(MINUTE, ve.entry_time, COALESCE(ve.exit_time, NOW())) AS minutes_inside,\r\n  (ve.overstay_flagged = 1 OR (ve.status = 'checked_in' AND ve.to_time IS NOT NULL AND CURTIME() > ve.to_time)) AS is_overstay`;"
  );
}

// 2. Update POST / schema
if (!content.includes('visitDate:')) {
  content = content.replace(
    "expectedAt: z.string().regex(/^\\d{4}-\\d{2}-\\d{2}[ T]\\d{2}:\\d{2}(:\\d{2})?$/).optional(),",
    "expectedAt: z.string().regex(/^\\d{4}-\\d{2}-\\d{2}[ T]\\d{2}:\\d{2}(:\\d{2})?$/).optional(),\r\n    visitDate: z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/).optional().nullable(),\r\n    fromTime: z.string().regex(/^\\d{2}:\\d{2}(:\\d{2})?$/).optional().nullable(),\r\n    toTime: z.string().regex(/^\\d{2}:\\d{2}(:\\d{2})?$/).optional().nullable(),"
  );

  // Update insert
  content = content.replace(
    "`INSERT INTO visitor_entries (pass_code, visitor_id, student_id, hostel_id, relationship, purpose, expected_at, entry_time, status, approved_by, checked_in_by, remarks)\r\n         VALUES (?,?,?,?,?,?,?,IF(?, NOW(), NULL),?,?,?,?)`,",
    "`INSERT INTO visitor_entries (pass_code, visitor_id, student_id, hostel_id, relationship, purpose, expected_at, visit_date, from_time, to_time, entry_time, status, approval_status, approved_by, checked_in_by, remarks)\r\n         VALUES (?,?,?,?,?,?,?,?,?,?,IF(?, NOW(), NULL),?,?,?,?,?)`,"
  );

  content = content.replace(
    "[tempCode(), visitor.id, studentId, alloc.hostel_id, b.relationship, b.purpose, b.expectedAt?.replace('T', ' ') || null,\r\n          b.checkInNow ? 1 : 0, b.checkInNow ? 'checked_in' : 'expected',\r\n          student ? null : req.user.id, b.checkInNow ? req.user.id : null,\r\n          b.override ? `Visiting-hours override: ${b.remarks}` : b.remarks || null]",
    "[tempCode(), visitor.id, studentId, alloc.hostel_id, b.relationship, b.purpose, b.expectedAt?.replace('T', ' ') || (b.visitDate && b.fromTime ? `${b.visitDate} ${b.fromTime}:00` : null),\r\n          b.visitDate || null, b.fromTime || null, b.toTime || null,\r\n          b.checkInNow ? 1 : 0, b.checkInNow ? 'checked_in' : 'expected',\r\n          student ? 'pending' : 'approved',\r\n          student ? null : req.user.id, b.checkInNow ? req.user.id : null,\r\n          b.override ? `Visiting-hours override: ${b.remarks}` : b.remarks || null]"
  );
}

// 3. Add Approve and Reject endpoints for warden
if (!content.includes("router.patch('/:id/approve'")) {
  const wardenEndpoints = `
/** PATCH /api/visitors/:id/approve  warden approves a visitor request */
router.patch('/:id/approve', authorize('visitors.manage'), validate(z.object({ remarks: z.string().trim().max(255).optional() })), async (req, res) => {
  await db.transaction(async (conn) => {
    const e = await loadEntry(req.params.id, conn);
    assertScope(req.user, e.hostel_id);
    if (e.approval_status === 'approved') throw conflict('Visitor request is already approved', 'ALREADY_APPROVED');
    await conn.query("UPDATE visitor_entries SET approval_status = 'approved', approved_by = ?, remarks = CONCAT_WS(' | ', remarks, ?) WHERE id = ?",
      [req.user.id, req.body.remarks || 'Approved by warden', e.id]);
    await notify(e.student_user_id, {
      type: 'visitor_approved',
      title: 'Visitor pass approved',
      message: \`Visitor request \${e.pass_code} for \${e.visitor_name} has been approved.\`,
      link: '/my/visitors',
    }, conn);
    await audit(req, { action: 'VISITOR_APPROVED', module: 'visitors', recordId: e.id, summary: \`Approved \${e.pass_code} for \${e.visitor_name}\` }, conn);
  });
  ok(res, { id: Number(req.params.id), approvalStatus: 'approved' });
});

/** PATCH /api/visitors/:id/reject  warden rejects a visitor request */
router.patch('/:id/reject', authorize('visitors.manage'), validate(z.object({ remarks: z.string().trim().min(3).max(255) })), async (req, res) => {
  await db.transaction(async (conn) => {
    const e = await loadEntry(req.params.id, conn);
    assertScope(req.user, e.hostel_id);
    await conn.query("UPDATE visitor_entries SET approval_status = 'rejected', status = 'cancelled', rejection_remarks = ? WHERE id = ?",
      [req.body.remarks, e.id]);
    await notify(e.student_user_id, {
      type: 'visitor_rejected',
      title: 'Visitor pass rejected',
      message: \`Visitor request \${e.pass_code} for \${e.visitor_name} was rejected: \${req.body.remarks}\`,
      link: '/my/visitors',
    }, conn);
    await audit(req, { action: 'VISITOR_REJECTED', module: 'visitors', recordId: e.id, summary: \`Rejected \${e.pass_code}: \${req.body.remarks}\` }, conn);
  });
  ok(res, { id: Number(req.params.id), approvalStatus: 'rejected', status: 'cancelled' });
});
`;

  content = content.replace("/** POST /api/visitors/:id/check-out */", `${wardenEndpoints}\r\n/** POST /api/visitors/:id/check-out */`);
}

// 4. Update check-out to flag overstay
if (!content.includes('overstay_flagged = ?')) {
  content = content.replace(
    'await conn.query("UPDATE visitor_entries SET status = \'checked_out\', exit_time = NOW(), checked_out_by = ? WHERE id = ?", [req.user.id, e.id]);',
    `const nowHm = new Date().toTimeString().slice(0, 5);\r\n    const isLate = (e.to_time && nowHm > e.to_time.slice(0, 5)) || false;\r\n    await conn.query("UPDATE visitor_entries SET status = 'checked_out', exit_time = NOW(), checked_out_by = ?, overstay_flagged = ? WHERE id = ?", [req.user.id, isLate ? 1 : e.overstay_flagged, e.id]);`
  );
}

fs.writeFileSync('backend/src/modules/visitors/visitors.routes.js', content, 'utf8');
console.log('visitors.routes.js updated successfully');
