const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../backend/src/modules/exits/exits.routes.js');
let code = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');

const settlementEndpoints = `
/** GET /api/exits/:id/settlement  get real-time settlement breakdown */
router.get('/:id/settlement', authorize('exits.request', 'exits.manage'), async (req, res) => {
  const e = await loadExit(req.params.id);
  assertAccess(req.user, e);
  const calc = await calculateSettlement(e.id);
  ok(res, calc);
});

/** GET /api/exits/:id/statement  stream official Settlement Statement PDF */
router.get('/:id/statement', authorize('exits.request', 'exits.manage'), async (req, res) => {
  const e = await loadExit(req.params.id);
  assertAccess(req.user, e);
  const calc = await calculateSettlement(e.id);
  const rec = calc.exitRecord;

  const doc = new PDFDocument({ size: 'A4', margin: 36 });
  const filename = \`Exit_Settlement_\${rec.register_number}_\${rec.id}.pdf\`;

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', \`inline; filename="\${filename}"\`);
  doc.pipe(res);

  // Logo if present
  const logoPath = path.join(__dirname, '../../../../frontend/public/nscet-logo.png');
  if (fs.existsSync(logoPath)) {
    try {
      doc.image(logoPath, 36, 32, { width: 55 });
    } catch (_) {}
  }

  // Header
  doc.fillColor('#0f2042').fontSize(14).font('Helvetica-Bold')
    .text('NADAR SARASWATHI COLLEGE OF ENGINEERING & TECHNOLOGY', 100, 36, { align: 'center' });
  doc.fillColor('#475569').fontSize(9).font('Helvetica')
    .text('Approved by AICTE, New Delhi & Affiliated to Anna University, Chennai', { align: 'center' })
    .text('Vadapudupatti, Annanji (PO), Theni - 625 531, Tamil Nadu', { align: 'center' });
  doc.moveDown(0.8);

  doc.strokeColor('#e2e8f0').lineWidth(1).moveTo(36, doc.y).lineTo(559, doc.y).stroke();
  doc.moveDown(0.8);

  doc.fillColor('#1e3a8a').fontSize(12).font('Helvetica-Bold')
    .text('HOSTEL EXIT CLEARANCE & FINAL SETTLEMENT STATEMENT', { align: 'center' });
  doc.moveDown(0.6);

  // Student Details Box
  const startY = doc.y;
  doc.rect(36, startY, 523, 75).fillAndStroke('#f8fafc', '#cbd5e1');
  doc.fillColor('#0f172a').fontSize(9).font('Helvetica');

  doc.text(\`Student Name: \${rec.student_name}\`, 46, startY + 8);
  doc.text(\`Register No: \${rec.register_number}\`, 320, startY + 8);

  doc.text(\`Hostel: \${rec.hostel_name} (\${rec.hostel_code})\`, 46, startY + 24);
  doc.text(\`Room & Bed: Room \${rec.room_number || '—'}, Bed \${rec.bed_code}\`, 320, startY + 24);

  doc.text(\`Exit Date: \${rec.exit_date || rec.requested_exit_date}\`, 46, startY + 40);
  doc.text(\`Reason: \${rec.reason.replace(/_/g, ' ').toUpperCase()}\`, 320, startY + 40);

  doc.text(\`Clearance Status: \${rec.clearance_status.toUpperCase()}\`, 46, startY + 56);
  doc.text(\`Room Condition: \${(rec.room_condition || 'Inspected').replace(/_/g, ' ').toUpperCase()}\`, 320, startY + 56);

  doc.y = startY + 85;
  doc.moveDown(0.5);

  // Financial Settlement Table
  doc.fillColor('#0f172a').fontSize(11).font('Helvetica-Bold').text('Financial Settlement Breakdown', 36);
  doc.moveDown(0.4);

  const tableTop = doc.y;
  doc.rect(36, tableTop, 523, 20).fill('#0f2042');
  doc.fillColor('#ffffff').fontSize(9).font('Helvetica-Bold')
    .text('Item Description', 46, tableTop + 5)
    .text('Type', 360, tableTop + 5)
    .text('Amount (₹)', 480, tableTop + 5, { width: 70, align: 'right' });

  const rows = [
    { desc: 'Room Rent Due (per college vacate policy)', type: 'Due', amt: calc.roomRentDue },
    { desc: \`Mess Charges (\${calc.attendanceSessions} sessions attended @ ₹\${calc.perSessionRate.toFixed(2)} + pending)\`, type: 'Due', amt: calc.pendingMessBill },
    { desc: \`Room Damage / Fixture Repair Charges (\${rec.room_condition || 'Good'})\`, type: 'Due', amt: calc.damageCharges },
    { desc: 'General Pending College & Hostel Dues', type: 'Due', amt: calc.pendingFees },
    { desc: 'Less: Caution Deposit Refundable', type: 'Credit', amt: -calc.cautionDeposit },
    { desc: 'Less: Advance Hostel Fees Paid', type: 'Credit', amt: -calc.advancePaid },
  ];

  let currentY = tableTop + 20;
  rows.forEach((r, idx) => {
    const bg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
    doc.rect(36, currentY, 523, 20).fillAndStroke(bg, '#f1f5f9');
    doc.fillColor('#334155').fontSize(9).font('Helvetica')
      .text(r.desc, 46, currentY + 5)
      .text(r.type, 360, currentY + 5);
    const amtStr = r.amt < 0 ? \`- ₹\${Math.abs(r.amt).toLocaleString('en-IN', { minimumFractionDigits: 2 })}\` : \`₹\${r.amt.toLocaleString('en-IN', { minimumFractionDigits: 2 })}\`;
    doc.font(r.type === 'Credit' ? 'Helvetica-Oblique' : 'Helvetica')
      .text(amtStr, 460, currentY + 5, { width: 90, align: 'right' });
    currentY += 20;
  });

  // Net Summary Row
  doc.rect(36, currentY, 523, 26).fill(calc.settlementType === 'refundable' ? '#ecfdf5' : calc.settlementType === 'payable' ? '#fef2f2' : '#f8fafc');
  doc.strokeColor('#cbd5e1').rect(36, currentY, 523, 26).stroke();

  const netLabel = calc.settlementType === 'refundable'
    ? 'NET REFUNDABLE TO STUDENT (Via Bank Transfer)'
    : calc.settlementType === 'payable'
    ? 'NET PAYABLE BY STUDENT (Due at office)'
    : 'NIL DUES CLEARANCE (All accounts settled)';

  const netColor = calc.settlementType === 'refundable' ? '#065f46' : calc.settlementType === 'payable' ? '#991b1b' : '#1e293b';

  doc.fillColor(netColor).fontSize(10).font('Helvetica-Bold')
    .text(netLabel, 46, currentY + 7);
  doc.text(\`₹\${calc.netAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}\`, 440, currentY + 7, { width: 110, align: 'right' });

  currentY += 36;
  doc.y = currentY;

  // Inspection Checklist Summary
  if (rec.inspection_checklist || rec.inspection_notes) {
    doc.fillColor('#0f172a').fontSize(10).font('Helvetica-Bold').text('Inspection & Handover Checklist', 36);
    doc.moveDown(0.2);
    doc.fillColor('#475569').fontSize(8.5).font('Helvetica')
      .text(\`Inspection Remarks: \${rec.inspection_notes || 'All fixtures and room amenities verified.'}\`, 36);
    if (rec.damage_photo_url) {
      doc.text('Damage Evidence: Image proof captured and archived in institution portal.', 36);
    }
    doc.moveDown(0.6);
  }

  // Signatures
  doc.y = Math.max(doc.y + 20, 680);
  const sigY = doc.y;

  doc.strokeColor('#cbd5e1').lineWidth(0.8)
    .moveTo(46, sigY).lineTo(170, sigY).stroke()
    .moveTo(230, sigY).lineTo(350, sigY).stroke()
    .moveTo(410, sigY).lineTo(540, sigY).stroke();

  doc.fillColor('#334155').fontSize(8.5).font('Helvetica')
    .text('Resident Student Signature', 46, sigY + 6, { width: 124, align: 'center' })
    .text('Hostel Warden', 230, sigY + 6, { width: 120, align: 'center' })
    .text('Accounts Officer / Principal', 410, sigY + 6, { width: 130, align: 'center' });

  doc.end();
});
`;

const target = "/**\n * PATCH /api/exits/:id/clear";
if (code.includes(target) && !code.includes("router.get('/:id/settlement'")) {
  code = code.replace(target, settlementEndpoints + "\n" + target);
  fs.writeFileSync(filePath, code.replace(/\n/g, '\r\n'), 'utf8');
  console.log('Successfully inserted settlement endpoints in exits.routes.js');
} else {
  console.log('Target not found or already inserted');
}
