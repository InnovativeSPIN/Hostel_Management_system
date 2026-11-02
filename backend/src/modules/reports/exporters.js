const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

const cell = (v) => (v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v));

function toCsv(columns, rows) {
  const esc = (v) => {
    let s = cell(v);
    // Neutralise spreadsheet formula injection.
    if (/^[=+\-@]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return `﻿${[columns.map((c) => esc(c.label)).join(','), ...rows.map((r) => columns.map((c) => esc(r[c.key])).join(','))].join('\r\n')}`;
}

async function toXlsx(title, columns, rows, meta = []) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Hostel ERP';
  const ws = wb.addWorksheet(title.slice(0, 31));
  ws.addRow([title]).font = { bold: true, size: 14 };
  meta.forEach((m) => ws.addRow([m]).font = { italic: true, color: { argb: 'FF666666' } });
  ws.addRow([]);
  const header = ws.addRow(columns.map((c) => c.label));
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } }; });
  rows.forEach((r) => ws.addRow(columns.map((c) => r[c.key] ?? '')));
  columns.forEach((c, i) => {
    const width = Math.min(45, Math.max(c.label.length, ...rows.slice(0, 200).map((r) => cell(r[c.key]).length)) + 2);
    ws.getColumn(i + 1).width = width;
  });
  return wb.xlsx.writeBuffer();
}

function toPdf(title, columns, rows, meta = []) {
  return new Promise((resolve) => {
    const landscape = columns.length > 6;
    const doc = new PDFDocument({ size: 'A4', layout: landscape ? 'landscape' : 'portrait', margin: 36 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));

    doc.fontSize(15).fillColor('#1e3a8a').text(title);
    doc.fontSize(8).fillColor('#666').text(meta.join('   |   '));
    doc.moveDown(0.6);

    const width = doc.page.width - 72;
    const colW = width / columns.length;
    const drawHeader = () => {
      const y = doc.y;
      doc.rect(36, y, width, 16).fill('#1e3a8a');
      doc.fillColor('#fff').fontSize(7.5);
      columns.forEach((c, i) => doc.text(c.label, 38 + i * colW, y + 4, { width: colW - 4, ellipsis: true, lineBreak: false }));
      doc.y = y + 18;
    };
    drawHeader();
    doc.fontSize(7.5);
    rows.forEach((r, idx) => {
      if (doc.y > doc.page.height - 50) { doc.addPage(); drawHeader(); doc.fontSize(7.5); }
      const y = doc.y;
      if (idx % 2) doc.rect(36, y - 1, width, 13).fill('#f1f5f9');
      doc.fillColor('#111');
      columns.forEach((c, i) => doc.text(cell(r[c.key]), 38 + i * colW, y + 2, { width: colW - 4, ellipsis: true, lineBreak: false }));
      doc.y = y + 13;
    });
    if (!rows.length) doc.fillColor('#666').text('No records for the selected filters.');
    doc.fontSize(7).fillColor('#999').text(`Generated ${new Date().toLocaleString('en-IN')} · ${rows.length} record(s)`, 36, doc.page.height - 30);
    doc.end();
  });
}

// Simple label/value PDF used by the Daily Hostel Status report.
function toSummaryPdf(title, sections, meta = []) {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.fontSize(18).fillColor('#1e3a8a').text(title);
    doc.fontSize(9).fillColor('#666').text(meta.join('   |   '));
    sections.forEach((s) => {
      doc.moveDown(0.8).fontSize(11).fillColor('#1e3a8a').text(s.title);
      doc.moveDown(0.2);
      s.items.forEach(([label, value, flag]) => {
        const y = doc.y;
        doc.fontSize(10).fillColor('#333').text(label, 60, y, { width: 300 });
        doc.fillColor(flag ? '#b91c1c' : '#111').text(String(value), 360, y, { width: 150, align: 'right' });
        doc.moveDown(0.15);
      });
    });
    doc.end();
  });
}

async function send(res, format, { filename, title, columns, rows, meta }) {
  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
    return res.send(toCsv(columns, rows));
  }
  if (format === 'xlsx') {
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
    return res.send(Buffer.from(await toXlsx(title, columns, rows, meta)));
  }
  if (format === 'pdf') {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.pdf"`);
    return res.send(await toPdf(title, columns, rows, meta));
  }
  return null;
}

module.exports = { toCsv, toXlsx, toPdf, toSummaryPdf, send };
