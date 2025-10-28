const express = require('express');
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');

module.exports = function (pool, { authenticateToken }, dbHelpers) {
  const router = express.Router();
  const { getDbConnection } = dbHelpers || {};

  const ensureRegularOrAdmin = (req, res, next) => {
    const type = req.user?.user_type || req.user?.userType;
    if (type === 'managed') {
      return res.status(403).json({ error: 'Managed users cannot access this resource' });
    }
    next();
  };

  function toNumber(val) {
    const n = Number(val);
    return Number.isFinite(n) ? n : 0;
  }

  function buildDocPrefix(dateStr) {
    // dateStr: YYYY-MM-DD
    if (!dateStr) return 'IDE-';
    const [y, m, d] = String(dateStr).split('-');
    return `IDE-${d}${m}${y}`; // IDE-DDMMYYYY
  }

  async function generateDocNumber(conn, dateStr) {
    const prefix = buildDocPrefix(dateStr);
    const rows = await conn.query(
      'SELECT doc_number FROM ide_daily_float_reports WHERE doc_number LIKE ? ORDER BY doc_number DESC LIMIT 1',
      [`${prefix}%`]
    );
    let next = 1;
    if (rows.length) {
      const last = rows[0].doc_number;
      const tail = last.replace(prefix, '').replace(/[^0-9]/g, '');
      const prev = parseInt(tail, 10);
      if (Number.isFinite(prev)) next = prev + 1;
    }
    return `${prefix}${String(next).padStart(4, '0')}`;
  }

  function computeDiffs(payload) {
    const opening_client = toNumber(payload.opening_client);
    const opening_company = toNumber(payload.opening_company);
    const closing_client = toNumber(payload.closing_client);
    const closing_company = toNumber(payload.closing_company);
    const daily_change_client = toNumber(payload.daily_change_client);
    const daily_change_company = toNumber(payload.daily_change_company);
    const winloss_client = toNumber(payload.winloss_client);
    const winloss_company = toNumber(payload.winloss_company);
    return {
      opening_client,
      opening_company,
      opening_diff: (payload.opening_diff !== undefined && payload.opening_diff !== null && payload.opening_diff !== '') ? toNumber(payload.opening_diff) : (opening_company - opening_client),
      closing_client,
      closing_company,
      closing_diff: (payload.closing_diff !== undefined && payload.closing_diff !== null && payload.closing_diff !== '') ? toNumber(payload.closing_diff) : (closing_company - closing_client),
      daily_change_client,
      daily_change_company,
      daily_change_diff: (payload.daily_change_diff !== undefined && payload.daily_change_diff !== null && payload.daily_change_diff !== '') ? toNumber(payload.daily_change_diff) : (daily_change_company - daily_change_client),
      winloss_client,
      winloss_company,
      winloss_diff: (payload.winloss_diff !== undefined && payload.winloss_diff !== null && payload.winloss_diff !== '') ? toNumber(payload.winloss_diff) : (winloss_company - winloss_client),
    };
  }

  async function logAction(conn, reportId, userId, action, details) {
    try {
      await conn.query(
        'INSERT INTO ide_daily_float_report_logs (report_id, user_id, action, details) VALUES (?, ?, ?, ?)',
        [reportId, userId || null, action, JSON.stringify(details || {})]
      );
    } catch (e) {
      console.warn('ide-float-report: failed to insert log:', e.message);
    }
  }

  // Create a draft
  router.post('/draft', authenticateToken, ensureRegularOrAdmin, async (req, res) => {
    let conn;
    try {
      const {
        report_date, // YYYY-MM-DD
        client_name,
        remarks = '',
      } = req.body || {};
      if (!report_date || !client_name) {
        return res.status(400).json({ error: 'report_date and client_name are required' });
      }

      conn = getDbConnection ? await getDbConnection(pool) : await pool.getConnection();
      const doc_number = await generateDocNumber(conn, report_date);
      const v = computeDiffs(req.body || {});

      const result = await conn.query(
        `INSERT INTO ide_daily_float_reports (
          doc_number, report_date, client_name,
          opening_client, opening_company, opening_diff,
          closing_client, closing_company, closing_diff,
          daily_change_client, daily_change_company, daily_change_diff,
          winloss_client, winloss_company, winloss_diff,
          remarks, status, user_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?)`,
        [
          doc_number, report_date, client_name,
          v.opening_client, v.opening_company, v.opening_diff,
          v.closing_client, v.closing_company, v.closing_diff,
          v.daily_change_client, v.daily_change_company, v.daily_change_diff,
          v.winloss_client, v.winloss_company, v.winloss_diff,
          remarks, req.user?.id || null,
        ]
      );
      const newId = Number(result.insertId);
      await logAction(conn, newId, req.user?.id, 'create', { doc_number, report_date, client_name });
      return res.json({ id: newId, doc_number, status: 'draft' });
    } catch (e) {
      console.error('ide-float-report draft error:', e);
      res.status(500).json({ error: 'Failed to create draft', details: e.message });
    } finally {
      if (conn) conn.release();
    }
  });

  // Update an existing report (still draft or final)
  router.put('/:id', authenticateToken, ensureRegularOrAdmin, async (req, res) => {
    let conn; try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });
      conn = getDbConnection ? await getDbConnection(pool) : await pool.getConnection();
      const {
        report_date,
        client_name,
        remarks = '',
        status,
      } = req.body || {};
      const v = computeDiffs(req.body || {});
      const st = status === 'final' ? 'final' : 'draft';
      const result = await conn.query(
        `UPDATE ide_daily_float_reports SET 
          report_date = COALESCE(?, report_date),
          client_name = COALESCE(?, client_name),
          opening_client = ?, opening_company = ?, opening_diff = ?,
          closing_client = ?, closing_company = ?, closing_diff = ?,
          daily_change_client = ?, daily_change_company = ?, daily_change_diff = ?,
          winloss_client = ?, winloss_company = ?, winloss_diff = ?,
          remarks = ?, status = ?
        WHERE id = ?`,
        [
          report_date || null,
          client_name || null,
          v.opening_client, v.opening_company, v.opening_diff,
          v.closing_client, v.closing_company, v.closing_diff,
          v.daily_change_client, v.daily_change_company, v.daily_change_diff,
          v.winloss_client, v.winloss_company, v.winloss_diff,
          remarks, st,
          id,
        ]
      );
      if (result.affectedRows > 0) await logAction(conn, id, req.user?.id, 'update', req.body || {});
      res.json({ success: result.affectedRows > 0 });
    } catch (e) {
      console.error('ide-float-report update error:', e);
      res.status(500).json({ error: 'Failed to update report' });
    } finally { if (conn) conn.release(); }
  });

  // Get a report
  router.get('/:id', authenticateToken, ensureRegularOrAdmin, async (req, res) => {
    let conn; try {
      const id = Number(req.params.id);
      conn = getDbConnection ? await getDbConnection(pool) : await pool.getConnection();
      const rows = await conn.query('SELECT * FROM ide_daily_float_reports WHERE id = ?', [id]);
      if (!rows.length) return res.status(404).json({ error: 'Not found' });
      res.json(rows[0]);
    } catch (e) {
      console.error('ide-float-report get error:', e);
      res.status(500).json({ error: 'Failed to get report' });
    } finally { if (conn) conn.release(); }
  });

  // Get logs for a report
  router.get('/:id/logs', authenticateToken, ensureRegularOrAdmin, async (req, res) => {
    let conn; try {
      const id = Number(req.params.id);
      conn = getDbConnection ? await getDbConnection(pool) : await pool.getConnection();
      const rows = await conn.query('SELECT id, action, user_id, details, created_at FROM ide_daily_float_report_logs WHERE report_id = ? ORDER BY id DESC', [id]);
      res.json(rows);
    } catch (e) {
      console.error('ide-float-report logs error:', e);
      res.status(500).json({ error: 'Failed to get logs' });
    } finally { if (conn) conn.release(); }
  });

  // List reports (optional filters: status, date range)
  router.get('/', authenticateToken, ensureRegularOrAdmin, async (req, res) => {
    let conn; try {
      conn = getDbConnection ? await getDbConnection(pool) : await pool.getConnection();
      let sql = 'SELECT * FROM ide_daily_float_reports WHERE 1=1';
      const params = [];
      if (req.query.status) { sql += ' AND status = ?'; params.push(req.query.status); }
      if (req.query.start_date && req.query.end_date) {
        sql += ' AND report_date BETWEEN ? AND ?';
        params.push(req.query.start_date, req.query.end_date);
      }
      sql += ' ORDER BY report_date DESC, id DESC LIMIT 100';
      const rows = await conn.query(sql, params);
      res.json(rows);
    } catch (e) {
      console.error('ide-float-report list error:', e);
      res.status(500).json({ error: 'Failed to list reports' });
    } finally { if (conn) conn.release(); }
  });

  // PDF download
  router.get('/:id/pdf', authenticateToken, ensureRegularOrAdmin, async (req, res) => {
    let conn; try {
      const id = Number(req.params.id);
      conn = getDbConnection ? await getDbConnection(pool) : await pool.getConnection();
      const rows = await conn.query('SELECT * FROM ide_daily_float_reports WHERE id = ?', [id]);
      if (!rows.length) return res.status(404).json({ error: 'Not found' });
      const r = rows[0];

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${r.doc_number}.pdf"`);
      // Build an auth-gated URL so QR requires login
      const base = (process.env.PUBLIC_SITE_URL || 'https://web.itradebook.com').replace(/\/$/, '');
      const qrUrl = `${base}/api/ide-float-report/${id}/pdf`;
      const qrDataUrl = await QRCode.toDataURL(qrUrl, { margin: 0, scale: 6 });
      const qrBase64 = qrDataUrl.split(',')[1];
      const qrBuffer = Buffer.from(qrBase64, 'base64');

      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      doc.pipe(res);

      // Layout constants (fit strictly within page)
      const margin = 50;
      const pageWidth = doc.page.width;
      const pageHeight = doc.page.height;
      const availableWidth = pageWidth - 2 * margin;
      let y = margin; // start near top
      const x = margin;

      // Header (absolute positions to avoid auto page breaks)
      doc.fontSize(22).fillColor('#000').text('IDE Daily Float Comparison Report', x, y, { width: availableWidth, lineBreak: false });
      y += 28;
      doc.moveTo(x, y).lineTo(pageWidth - margin, y).strokeColor('#0a5a9c').stroke();
      y += 10;

      // Date and Client in one line
      doc.fontSize(11).fillColor('#000');
      const dateW = 220;
      const clientX = x + Math.min(260, Math.floor(availableWidth * 0.5));
      const clientW = availableWidth - (clientX - x);
      doc.text(`Date: ${r.report_date || ''}`, x, y, { width: dateW, lineBreak: false });
      doc.text(`Client: ${r.client_name || ''}`, clientX, y, { width: clientW, lineBreak: false });
      y += 22;

      // Table grid with padding and header fill (autosized to available width)
      const wMetric = Math.floor(availableWidth * 0.46);
      const wClient = Math.floor(availableWidth * 0.18);
      const wCompany = Math.floor(availableWidth * 0.18);
      const wDiff = availableWidth - (wMetric + wClient + wCompany); // fill remaining to avoid overflow
      const rowH = 26; // taller rows for visual padding
      const tableLeft = x;
      const tableTop = y;
      const totalW = wMetric + wClient + wCompany + wDiff; // equals availableWidth

      // Headers
      const headPadX = 10;
      const textY = (rowH - 11) / 2; // vertically center 11pt text
      doc.save();
      doc.rect(tableLeft, tableTop, totalW, rowH).fill('#e9eef7');
      doc.restore();
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#000');
      doc.text('Metric', tableLeft + headPadX, tableTop + textY, { width: wMetric - 2 * headPadX, lineBreak: false });
      doc.text('Client', tableLeft + wMetric + headPadX, tableTop + textY, { width: wClient - 2 * headPadX, lineBreak: false });
      doc.text('Company', tableLeft + wMetric + wClient + headPadX, tableTop + textY, { width: wCompany - 2 * headPadX, lineBreak: false });
      doc.text('Difference', tableLeft + wMetric + wClient + wCompany + headPadX, tableTop + textY, { width: wDiff - 2 * headPadX, lineBreak: false });

      // Draw grid lines (header + 4 data rows)
      doc.lineWidth(0.7).strokeColor('#444');
      for (let i = 0; i <= 5; i++) {
        const yy = tableTop + i * rowH;
        doc.moveTo(tableLeft, yy).lineTo(tableLeft + totalW, yy).stroke();
      }
      const x1 = tableLeft, x2 = tableLeft + wMetric, x3 = x2 + wClient, x4 = x3 + wCompany, x5 = x4 + wDiff;
      doc.moveTo(x1, tableTop).lineTo(x1, tableTop + rowH * 5).stroke();
      doc.moveTo(x2, tableTop).lineTo(x2, tableTop + rowH * 5).stroke();
      doc.moveTo(x3, tableTop).lineTo(x3, tableTop + rowH * 5).stroke();
      doc.moveTo(x4, tableTop).lineTo(x4, tableTop + rowH * 5).stroke();
      doc.moveTo(x5, tableTop).lineTo(x5, tableTop + rowH * 5).stroke();

      // Data rows
      const rowsToPrint = [
        { m: 'Opening Float (USD)', c: r.opening_client, co: r.opening_company, d: r.opening_diff },
        { m: 'Closing Float (USD)', c: r.closing_client, co: r.closing_company, d: r.closing_diff },
        { m: 'Daily Change (%)', c: r.daily_change_client, co: r.daily_change_company, d: r.daily_change_diff },
        { m: 'Win/Loss', c: r.winloss_client, co: r.winloss_company, d: r.winloss_diff },
      ];
      doc.font('Helvetica').fontSize(11).fillColor('#000');
      rowsToPrint.forEach((row, idx) => {
        const yy = tableTop + rowH * (idx + 1) + textY; // centered
        const padX = 10;
        doc.text(String(row.m ?? ''), tableLeft + padX, yy, { width: wMetric - 2 * padX, lineBreak: false });
        doc.text(String(row.c ?? ''), tableLeft + wMetric + padX, yy, { width: wClient - 2 * padX, lineBreak: false });
        doc.text(String(row.co ?? ''), tableLeft + wMetric + wClient + padX, yy, { width: wCompany - 2 * padX, lineBreak: false });
        doc.text(String(row.d ?? ''), tableLeft + wMetric + wClient + wCompany + padX, yy, { width: wDiff - 2 * padX, lineBreak: false });
      });
      y = tableTop + rowH * 5; // move below table

      // Remarks block — clamp text so it NEVER spills to another page
      y += 14;
      doc.font('Helvetica-Bold').fontSize(11).text('Remarks:', x, y, { width: availableWidth, lineBreak: false });
      y += 16;
      const remarksWidth = availableWidth;
      const remarksHeight = 80;
      const remarkOptions = { width: remarksWidth, align: 'left' };
      let remarkText = String(r.remarks || '');
      // Binary search to fit text into the fixed-height rectangle
      const fits = (t) => doc.heightOfString(t, remarkOptions) <= remarksHeight;
      if (!fits(remarkText)) {
        let lo = 0, hi = remarkText.length, best = '';
        while (lo <= hi) {
          const mid = Math.floor((lo + hi) / 2);
          const cand = remarkText.slice(0, mid) + '…';
          if (fits(cand)) { best = cand; lo = mid + 1; } else { hi = mid - 1; }
        }
        remarkText = best || remarkText.slice(0, Math.min(remarkText.length, 200)) + '…';
      }
      doc.font('Helvetica').fontSize(11).fillColor('#000').text(remarkText, x, y, remarkOptions);

      // Watermark: QR code + labels at bottom-right (low opacity)
      const qrSize = 90;
      const qrX = pageWidth - qrSize - 60;
      const qrY = pageHeight - qrSize - 150; // generous bottom margin
      doc.opacity(0.18);
      try { doc.image(qrBuffer, qrX, qrY, { width: qrSize, height: qrSize }); } catch {}
      doc.opacity(0.45).fillColor('#444');
      doc.fontSize(10).text('IdealExecution', qrX - 10, qrY + qrSize + 6, { width: qrSize + 20, align: 'center', lineBreak: false });
      doc.fontSize(9).text(`Document: ${r.doc_number}`, qrX - 10, qrY + qrSize + 24, { width: qrSize + 20, align: 'center', lineBreak: false });
      doc.opacity(1).fillColor('#000');

      // Footer removed to avoid duplicate 'Document:' and any auto-pagination

      doc.end();
    } catch (e) {
      console.error('ide-float-report pdf error:', e);
      res.status(500).json({ error: 'Failed to generate PDF' });
    } finally { if (conn) conn.release(); }
  });

  return { router };
};
